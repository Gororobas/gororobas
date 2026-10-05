import { Crypto, DateTime, Effect } from "effect";
import { Base64Url } from "effect/encoding";

import { SecurityRevision } from "../sessions/models";
import {
  connectedGrantResponse,
  connectedRead,
  connectedSame,
  validateConnectedPolicy,
  wipeConnectedMaterial,
} from "./connectedAccess";
import {
  OAuthConnectedConfiguration,
  OAuthConnectedGrantResponse,
  OAuthConnectedProfile,
  OAuthConnectedSettlementDecision,
  OAuthConnectedStoredGrant,
  OAuthConnectedRevocationContext,
  OAuthConnectedRevocationJob,
  OAuthConnectedTokenContext,
  OAuthGrantId,
} from "./connectedModels";
import { OAuthConnectedPersistence } from "./OAuthConnectedPersistence";
import { OAuthConnectedProtocol } from "./OAuthConnectedProtocol";
import { OAuthConnectedTokenProtector } from "./OAuthConnectedTokenProtector";
import { OAuthSignInAccessClaim, OAuthSignInAccessInspection } from "./signInAccessModels";
import { OAuthConfigurationError, OAuthRejected, OAuthUnavailable } from "./signInErrors";
import {
  OAuthCallbackId,
  OAuthClaimId,
  type OAuthClaim,
  type OAuthCredentialSnapshot,
  OAuthProtocolConfiguration,
  type OAuthSignInPolicy,
  OAuthVerifiedExternalIdentity,
} from "./signInModels";
import { snapshotOAuth, snapshotOAuthSync } from "./signInSnapshot";

/** The ordinary sign-in workflow owns the callback and session. This capability
 * adds the single connected exchange and confirmed grant retention to that flow. */
const make = Effect.fnUntraced(function* (
  moduleId: string,
  policy: OAuthSignInPolicy,
  raw: OAuthConnectedProfile,
) {
  const profile = yield* snapshotOAuth(OAuthConnectedProfile, raw).pipe(
    Effect.mapError(() => OAuthConfigurationError.make({ reason: "policy" })),
  );

  yield* validateConnectedPolicy(moduleId, {
    ...policy,
    profiles: [profile],
    maximumEvidenceAgeMillis: 300_000,
    refreshClaimLifetimeMillis: policy.claimLifetimeMillis,
    useAdmissionLifetimeMillis: 5_000,
  });
  const protocol = yield* OAuthConnectedProtocol;
  const persistence = yield* OAuthConnectedPersistence;
  const protector = yield* OAuthConnectedTokenProtector;
  const crypto = yield* Crypto.Crypto;

  const random = crypto.randomBytes(32).pipe(
    Effect.mapError(() => OAuthUnavailable.make({})),
    Effect.map((bytes) => {
      const value = Base64Url.encode(bytes);

      bytes.fill(0);

      return value;
    }),
  );

  const prepare: import("./OAuthProtocol").OAuthProtocol["Service"]["prepareAuthorization"] =
    Effect.fn("OAuth.access.prepare")(function* (input) {
      if (input.provider !== profile.provider || profile.issuance !== "active")
        return yield* OAuthRejected.make({});

      const prepared = yield* protocol
        .prepareAuthorization({
          profile,
          callbackId: input.callbackId ?? OAuthCallbackId.make(input.provider),
          flowId: input.flowId,
        })
        .pipe(
          Effect.mapError((error) =>
            error._tag === "OAuthProtocolRejected" ? OAuthRejected.make({}) : error,
          ),
        );

      if (!connectedSame(OAuthConnectedProfile, prepared.configuration.profile, profile))
        return yield* OAuthUnavailable.make({});

      return prepared;
    });

  const claim = Effect.fn("OAuth.access.claim")(function* (claim: OAuthClaim) {
    if (
      claim.flow.context.access === undefined ||
      !connectedSame(OAuthConnectedProfile, claim.flow.context.access, profile)
    )
      return yield* OAuthRejected.make({});

    const configuration = yield* snapshotOAuth(OAuthConnectedConfiguration, {
      ...snapshotOAuthSync(OAuthProtocolConfiguration, claim.flow.context),
      profile: claim.flow.context.access,
    });

    const reservation = yield* persistence
      .claimSignIn({ claim, configuration }, (value, journal) =>
        journal.prepare(snapshotOAuthSync(OAuthSignInAccessClaim, value)),
      )
      .pipe(Effect.flatMap(connectedRead));

    if (
      !connectedSame(OAuthConnectedConfiguration, reservation.configuration, configuration) ||
      !connectedSame(OAuthSignInAccessClaim.fields.claim, reservation.claim, claim)
    )
      return yield* OAuthUnavailable.make({});

    return reservation;
  });

  const exchange = Effect.fn("OAuth.access.exchange")(function* (
    reservation: OAuthSignInAccessClaim,
    input: Omit<Parameters<typeof protocol.exchangeGrant>[0], "configuration">,
  ) {
    const grant = yield* protocol
      .exchangeGrant({ ...input, configuration: reservation.configuration })
      .pipe(Effect.flatMap((value) => snapshotOAuth(OAuthConnectedGrantResponse, value)));

    const continuation = grant.material.continuation;

    const identity = yield* snapshotOAuth(OAuthVerifiedExternalIdentity, {
      identity: grant.identity,
      ...(grant.profile === undefined ? {} : { profile: grant.profile }),
      ...(continuation._tag === "Oidc" && continuation.authTime !== undefined
        ? { upstreamAuthenticatedAt: DateTime.makeUnsafe(continuation.authTime * 1000) }
        : {}),
    });

    return { identity, grant };
  });

  const abandon = (
    reservation: OAuthSignInAccessClaim,
    outcome: "Cancelled" | "Rejected" | "Unissued" | "Ambiguous",
  ) =>
    persistence
      .settleSignIn({ reservation, outcome: { _tag: outcome } }, (value, journal) =>
        journal.prepare(snapshotOAuthSync(OAuthConnectedSettlementDecision, value)),
      )
      .pipe(Effect.flatMap(connectedRead), Effect.asVoid);

  const retain = Effect.fn("OAuth.access.retain")(function* (
    reservation: OAuthSignInAccessClaim,
    credential: OAuthCredentialSnapshot,
    grant: OAuthConnectedGrantResponse,
    startedAtMillis: number,
  ) {
    const inspected = yield* persistence
      .inspectSignIn({
        reservation,
        credential,
        grantId: OAuthGrantId.make(yield* random),
      })
      .pipe(Effect.flatMap((value) => snapshotOAuth(OAuthSignInAccessInspection, value)));

    if (inspected._tag === "Rejected") return yield* OAuthRejected.make({});

    const projected = yield* connectedGrantResponse(
      reservation.configuration,
      grant,
      startedAtMillis,
    );

    return yield* Effect.gen(function* () {
      const version = SecurityRevision.make(yield* random);

      const context = yield* snapshotOAuth(OAuthConnectedTokenContext, {
        namespace: "effect-auth/oauth-connected-token-context/v1",
        moduleId: reservation.claim.flow.context.moduleId,
        subjectId: credential.revision.subjectId,
        identity: projected.identity,
        configuration: reservation.configuration,
        grantId: inspected.grantId,
        grantVersion: version,
        exchangeOrder: reservation.order,
        tokenVersion: version,
        cohortGeneration: inspected.cohortGeneration,
        metadata: projected.metadata,
      });

      const stored = yield* snapshotOAuth(OAuthConnectedStoredGrant, {
        context,
        sealed: yield* protector.seal({ context, material: projected.material }),
      });

      let cleanup: typeof OAuthConnectedRevocationJob.Type | undefined;

      if (profile.revocation === "cohort") {
        const cleanupContext = yield* snapshotOAuth(OAuthConnectedRevocationContext, {
          namespace: "effect-auth/oauth-connected-revocation-context/v1",
          jobId: OAuthClaimId.make(yield* random),
          token: context,
        });

        cleanup = yield* snapshotOAuth(OAuthConnectedRevocationJob, {
          context: cleanupContext,
          sealed: yield* protector.seal({ context: cleanupContext, material: projected.material }),
        });
      }

      const settled = yield* persistence
        .settleSignIn(
          {
            reservation,
            outcome: {
              _tag: "Verified",
              credential,
              grant: stored,
              quarantine: inspected._tag === "Quarantine",
              ...(cleanup === undefined ? {} : { cleanup }),
              ...(inspected.previous === undefined ? {} : { previous: inspected.previous }),
            },
          },
          (value, journal) =>
            journal.prepare(snapshotOAuthSync(OAuthConnectedSettlementDecision, value)),
        )
        .pipe(Effect.flatMap(connectedRead));

      if (settled._tag !== "Connected") return yield* OAuthRejected.make({});
      if (!connectedSame(OAuthConnectedStoredGrant, settled.grant, stored))
        return yield* OAuthUnavailable.make({});

      return { grantId: context.grantId, profileKey: profile.key };
    }).pipe(Effect.ensuring(Effect.sync(() => wipeConnectedMaterial(projected.material))));
  });

  return { profile, prepare, claim, exchange, abandon, retain };
});

export type SignInAccess = Effect.Success<ReturnType<typeof make>>;
export type AccessServices = Effect.Services<ReturnType<typeof make>>;

/** Only the configured branch acquires connected services. */
export const signInAccess = <Access extends OAuthConnectedProfile | undefined>(
  moduleId: string,
  policy: OAuthSignInPolicy,
  profile: Access,
): Effect.Effect<
  SignInAccess | undefined,
  OAuthConfigurationError,
  Access extends OAuthConnectedProfile ? AccessServices : never
> =>
  (profile === undefined
    ? Effect.succeed(undefined)
    : make(moduleId, policy, profile)) as Effect.Effect<
    SignInAccess | undefined,
    OAuthConfigurationError,
    Access extends OAuthConnectedProfile ? AccessServices : never
  >;
