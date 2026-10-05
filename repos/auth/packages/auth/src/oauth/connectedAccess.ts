import {
  Cause,
  Context,
  Crypto,
  DateTime,
  Effect,
  Exit,
  Fiber,
  Layer,
  Redacted,
  Schema,
} from "effect";
import { Base64Url } from "effect/encoding";

import { hasCommitScope, type PreparedCommit } from "../hooks/commit";
import { reportAuthFailure } from "../internal/diagnostics";
import {
  AuthenticationAssurance,
  AssuranceEvidence,
  requireAuthenticated,
  type AuthInvocation,
} from "../operations/context";
import { AuthenticationRequired } from "../operations/errors";
import { SecurityRevision } from "../sessions/models";
import * as M from "./connectedModels";
import { retainGrantTokens } from "./grantTokens";
import { OAuthConnectedPersistence } from "./OAuthConnectedPersistence";
import { OAuthConnectedProtocol } from "./OAuthConnectedProtocol";
import { OAuthConnectedTokenProtector } from "./OAuthConnectedTokenProtector";
import { OAuthConnectedUseAuthority } from "./OAuthConnectedUseAuthority";
import {
  OAuthConfigurationError,
  OAuthMethodUnsupported,
  OAuthRejected,
  OAuthUnavailable,
} from "./signInErrors";
import { OAuthClaimId, OAuthExternalIdentity, OAuthModuleId } from "./signInModels";
import { snapshotOAuth, snapshotOAuthSync } from "./signInSnapshot";

export const OAuthConnectedAccessFailure = Schema.Union([
  AuthenticationRequired,
  OAuthRejected,
  OAuthUnavailable,
  OAuthMethodUnsupported,
  M.OAuthConnectedBusy,
  M.OAuthConnectedReauthorizationRequired,
]);

export type OAuthConnectedAccessFailure = typeof OAuthConnectedAccessFailure.Type;

const invocationSchema = Schema.TaggedStruct("Authenticated", {
  subjectId: M.OAuthConnectedTokenContext.fields.subjectId,
  sessionId: Schema.optionalKey(Schema.String.check(Schema.isMaxLength(256))),
  assurance: Schema.Struct({
    ...AuthenticationAssurance.fields,
    method: Schema.NonEmptyString.check(Schema.isMaxLength(128)),
    factors: AuthenticationAssurance.fields.factors.check(Schema.isMaxLength(8)),
    evidence: Schema.optionalKey(
      Schema.NonEmptyArray(
        Schema.Struct({
          ...AssuranceEvidence.fields,
          method: Schema.NonEmptyString.check(Schema.isMaxLength(128)),
          factors: AssuranceEvidence.fields.factors.check(Schema.isMaxLength(8)),
        }),
      ).check(Schema.isMaxLength(64)),
    ),
  }),
});

export const connectedCaller = Effect.fn("OAuthConnected.caller")(function* (
  invocation: AuthInvocation,
) {
  if (yield* hasCommitScope) return yield* OAuthMethodUnsupported.make({});

  return yield* snapshotOAuth(invocationSchema, yield* requireAuthenticated(invocation));
});

export const connectedRead = <A>(receipt: PreparedCommit<A>) =>
  receipt.read.pipe(Effect.mapError(() => OAuthUnavailable.make({})));

export const connectedSafe = <A, E, R>(effect: Effect.Effect<A, E, R>) =>
  effect.pipe(
    Effect.tapCause((cause) =>
      Cause.hasDies(cause) ? reportAuthFailure("oauth-connected", cause) : Effect.void,
    ),
    Effect.catchCause((cause): Effect.Effect<never, E | OAuthUnavailable> =>
      Cause.hasInterrupts(cause)
        ? Effect.interrupt
        : Cause.hasDies(cause)
          ? Effect.fail(OAuthUnavailable.make({}))
          : Effect.failCause(cause),
    ),
  );

export const connectedBounded = <A, E, R>(effect: Effect.Effect<A, E, R>, millis: number) =>
  Effect.gen(function* () {
    const fiber = yield* effect.pipe(Effect.interruptible, Effect.forkChild);

    return yield* Fiber.join(fiber).pipe(
      Effect.timeout(millis),
      Effect.ensuring(Fiber.interrupt(fiber)),
    );
  });

export const connectedSame = <A>(schema: Schema.Codec<A, unknown, never, never>, a: A, b: A) =>
  Schema.encodeSync(Schema.fromJsonString(schema))(a) ===
  Schema.encodeSync(Schema.fromJsonString(schema))(b);

export const captureConnectedPolicy = (input: M.OAuthConnectedPolicy) => {
  try {
    return snapshotOAuthSync(M.OAuthConnectedPolicy, input);
  } catch {
    return undefined;
  }
};

export const validateConnectedPolicy = Effect.fn("OAuthConnected.policy")(function* (
  moduleId: string,
  captured: M.OAuthConnectedPolicy | undefined,
) {
  const id = yield* Schema.decodeEffect(OAuthModuleId)(moduleId).pipe(
    Effect.mapError(() => OAuthConfigurationError.make({ reason: "module" })),
  );

  if (!captured) return yield* OAuthConfigurationError.make({ reason: "policy" });

  const seen = new Set<string>(),
    active = new Set<string>();

  for (const profile of captured.profiles) {
    const key = profile.key + ":" + profile.generation;

    if (
      seen.has(key) ||
      (profile.issuance === "active" && active.has(profile.key)) ||
      new Set(profile.scopes).size !== profile.scopes.length ||
      new Set(profile.resources).size !== profile.resources.length ||
      profile.refreshAheadMillis >= profile.maximumAccessLifetimeMillis ||
      (profile.retention === "access-and-refresh" &&
        (profile.maximumRefreshLifetimeMillis === undefined ||
          profile.refresh === "unsupported")) ||
      (profile.retention === "access-only" && profile.refresh !== "unsupported")
    )
      return yield* OAuthConfigurationError.make({ reason: "policy" });
    seen.add(key);
    if (profile.issuance === "active") active.add(profile.key);
  }
  if (active.size === 0) return yield* OAuthConfigurationError.make({ reason: "policy" });

  return { id, policy: captured };
});

export const connectedProfile = (
  policy: M.OAuthConnectedPolicy,
  input: M.OAuthConnectedProfile,
) => {
  const current = policy.profiles.find((p) => p.key === input.key && p.issuance === "active");

  return (
    current !== undefined &&
    connectedSame(M.OAuthConnectedProfile, current, { ...input, issuance: "active" })
  );
};

export const connectedUseAuthorization = Effect.fn("OAuthConnected.useAuthorization")(function* (
  value: M.OAuthConnectedUseAuthorization,
  moduleId: typeof OAuthModuleId.Type,
  subjectId: typeof M.OAuthConnectedTokenContext.Type.subjectId,
  purpose: "metadata" | "use",
  grantId?: typeof M.OAuthGrantId.Type,
  profileKey?: typeof M.OAuthPermissionProfileKey.Type,
) {
  const authorization = yield* snapshotOAuth(M.OAuthConnectedUseAuthorization, value);
  const now = DateTime.toEpochMillis(yield* DateTime.now);

  if (
    authorization.moduleId !== moduleId ||
    authorization.revision.subjectId !== subjectId ||
    authorization.purpose !== purpose ||
    authorization.grantId !== grantId ||
    authorization.profileKey !== profileKey ||
    authorization.expiresAtMillis <= now ||
    new Set(authorization.revision.credentials.map((v) => v.credentialId)).size !==
      authorization.revision.credentials.length
  )
    return yield* OAuthUnavailable.make({});

  return authorization;
});

export const wipeConnectedMaterial = (material: M.OAuthConnectedTokenMaterial) => {
  Redacted.wipeUnsafe(material.accessToken);
  if (material.refreshToken) Redacted.wipeUnsafe(material.refreshToken);
  if (material.continuation._tag === "Oidc" && material.continuation.nonce)
    Redacted.wipeUnsafe(material.continuation.nonce);
};

/** Private bounded projection shared by initial and refresh orchestration. */
export const connectedGrantResponse = Effect.fn("OAuthConnected.grantResponse")(function* (
  configuration: M.OAuthConnectedConfiguration,
  raw: M.OAuthConnectedGrantResponse,
  startedAtMillis: number,
  previous?: {
    readonly context: M.OAuthConnectedTokenContext;
    readonly material: M.OAuthConnectedTokenMaterial;
  },
) {
  const response = yield* snapshotOAuth(M.OAuthConnectedGrantResponse, raw);
  const now = DateTime.toEpochMillis(yield* DateTime.now);
  const profile = configuration.profile;

  if (
    response.identity.provider !== configuration.provider ||
    response.identity.issuer !== configuration.issuer ||
    (configuration.protocol === "oidc") !== (response.material.continuation._tag === "Oidc") ||
    new Set(response.scopes).size !== response.scopes.length ||
    new Set(response.resources).size !== response.resources.length ||
    !connectedSame(
      M.OAuthConnectedScopes,
      [...response.scopes].sort(),
      [...profile.scopes].sort(),
    ) ||
    !connectedSame(
      M.OAuthConnectedResources,
      [...response.resources].sort(),
      [...profile.resources].sort(),
    ) ||
    (response.accessExpiresAtMillis !== undefined && response.accessExpiresAtMillis <= now) ||
    startedAtMillis > now ||
    startedAtMillis < 0
  )
    return yield* OAuthUnavailable.make({});
  if (
    previous &&
    (!connectedSame(OAuthExternalIdentity, response.identity, previous.context.identity) ||
      !connectedSame(
        M.OAuthConnectedContinuation,
        response.material.continuation,
        previous.material.continuation,
      ))
  )
    return yield* OAuthUnavailable.make({});

  const { material, refreshExpiresAtMillis: refreshExpires } = yield* retainGrantTokens(
    profile,
    response,
    previous,
  );

  const refreshUseUntil =
    material.refreshToken === undefined
      ? undefined
      : Math.min(
          previous?.context.metadata.refreshUseUntilMillis ??
            startedAtMillis + (profile.maximumRefreshLifetimeMillis ?? 0),
          refreshExpires ?? Number.MAX_SAFE_INTEGER,
        );

  const useUntil = Math.min(
    startedAtMillis + profile.maximumAccessLifetimeMillis,
    response.accessExpiresAtMillis ?? Number.MAX_SAFE_INTEGER,
  );

  if (useUntil <= now || (refreshUseUntil !== undefined && refreshUseUntil <= now))
    return yield* OAuthUnavailable.make({});

  const metadata = yield* snapshotOAuth(M.OAuthConnectedTokenMetadata, {
    scopes: response.scopes,
    resources: response.resources,
    useUntilMillis: useUntil,
    obtainedAtMillis: startedAtMillis,
    ...(response.accessExpiresAtMillis === undefined
      ? {}
      : { accessExpiresAtMillis: response.accessExpiresAtMillis }),
    ...(material.refreshToken === undefined || refreshExpires === undefined
      ? {}
      : { refreshExpiresAtMillis: refreshExpires }),
    ...(refreshUseUntil === undefined ? {} : { refreshUseUntilMillis: refreshUseUntil }),
    ...(response.profile === undefined ? {} : { profile: response.profile }),
  });

  return { identity: response.identity, metadata, material };
});

export interface AccessModule<Id extends string> {
  readonly moduleId: Id;
  readonly kind: "oauth-connected-access";
}

export const makeOAuthConnectedAccess = <const Id extends string>(
  moduleId: Id,
  configuration: M.OAuthConnectedPolicy,
) => {
  const ConnectedAccess = Context.Service<
    AccessModule<Id>,
    {
      readonly withAccessToken: <A, E, R>(
        invocation: AuthInvocation,
        input: typeof M.OAuthConnectedUse.Type,
        use: (accessToken: Redacted.Redacted<string>) => Effect.Effect<A, E, R>,
      ) => Effect.Effect<A, E | OAuthConnectedAccessFailure, R>;
    }
  >()("effect-auth/oauth/" + moduleId.length + ":" + moduleId + "/ConnectedAccess");

  const captured = captureConnectedPolicy(configuration);

  const accessLayer = Layer.effect(
    ConnectedAccess,
    Effect.gen(function* () {
      const { id, policy } = yield* validateConnectedPolicy(moduleId, captured);
      const { authorize } = yield* OAuthConnectedUseAuthority;

      const { inspectAccess, claimRefresh, settleRefresh, admitUse } =
        yield* OAuthConnectedPersistence;

      const { refreshGrant } = yield* OAuthConnectedProtocol;
      const { seal, open } = yield* OAuthConnectedTokenProtector;
      const { randomBytes } = yield* Crypto.Crypto;

      const random = Effect.fn("OAuthConnectedAccess.random")(function* () {
        const bytes = yield* randomBytes(32).pipe(Effect.mapError(() => OAuthUnavailable.make({})));
        const result = OAuthClaimId.make(Base64Url.encode(bytes));

        bytes.fill(0);

        return result;
      });

      const refresh = Effect.fn("OAuthConnectedAccess.refresh")(function* (
        grant: M.OAuthConnectedStoredGrant,
        authorization: M.OAuthConnectedUseAuthorization,
      ) {
        const claimId = yield* random(),
          nextTokenVersion = SecurityRevision.make(yield* random());

        return yield* Effect.uninterruptibleMask((restore) =>
          Effect.gen(function* () {
            const receipt = yield* restore(
              claimRefresh(
                {
                  grant: snapshotOAuthSync(M.OAuthConnectedStoredGrant, grant),
                  authorization,
                  claimId,
                  nextTokenVersion,
                  lifetimeMillis: policy.refreshClaimLifetimeMillis,
                },
                (value, journal) =>
                  journal.prepare(snapshotOAuthSync(M.OAuthConnectedRefreshDecision, value)),
              ),
            );

            const decision = yield* connectedRead(receipt);

            if (decision._tag === "Busy") return yield* M.OAuthConnectedBusy.make({});
            if (decision._tag === "ReauthorizationRequired")
              return yield* M.OAuthConnectedReauthorizationRequired.make({});
            if (decision._tag !== "Claimed") return yield* OAuthRejected.make({});
            const owned = snapshotOAuthSync(M.OAuthConnectedRefreshClaim, decision.claim);

            if (
              owned.claimId !== claimId ||
              owned.nextTokenVersion !== nextTokenVersion ||
              !connectedSame(M.OAuthConnectedStoredGrant, owned.grant, grant) ||
              owned.claimExpiresAtMillis !==
                owned.claimedAtMillis + policy.refreshClaimLifetimeMillis ||
              owned.claimedAtMillis > DateTime.toEpochMillis(yield* DateTime.now)
            )
              return yield* OAuthUnavailable.make({});

            const exchange = Effect.gen(function* () {
              const material = yield* open(
                snapshotOAuthSync(M.OAuthConnectedStoredGrant, grant),
              ).pipe(Effect.flatMap((v) => snapshotOAuth(M.OAuthConnectedTokenMaterial, v)));

              return yield* Effect.gen(function* () {
                const start = DateTime.toEpochMillis(yield* DateTime.now);

                if (
                  !material.refreshToken ||
                  grant.context.configuration.profile.refresh === "unsupported" ||
                  grant.context.metadata.refreshUseUntilMillis === undefined ||
                  grant.context.metadata.refreshUseUntilMillis <= start ||
                  start >= owned.claimExpiresAtMillis
                )
                  return yield* M.OAuthConnectedReauthorizationRequired.make({});

                const response = yield* refreshGrant({
                  context: snapshotOAuthSync(M.OAuthConnectedTokenContext, grant.context),
                  material: snapshotOAuthSync(M.OAuthConnectedTokenMaterial, material),
                  verificationStartedAt: DateTime.makeUnsafe(start),
                });

                const projected = yield* connectedGrantResponse(
                  grant.context.configuration,
                  response,
                  start,
                  { context: grant.context, material },
                );

                return yield* Effect.gen(function* () {
                  const context = snapshotOAuthSync(M.OAuthConnectedTokenContext, {
                    ...grant.context,
                    tokenVersion: nextTokenVersion,
                    exchangeOrder: owned.order,
                    metadata: projected.metadata,
                  });

                  const sealed = yield* seal({
                    context,
                    material: snapshotOAuthSync(M.OAuthConnectedTokenMaterial, projected.material),
                  });

                  const updated = snapshotOAuthSync(M.OAuthConnectedStoredGrant, {
                    context,
                    sealed,
                  });

                  let cleanup: M.OAuthConnectedRevocationJob | undefined;

                  if (context.configuration.profile.revocation === "cohort") {
                    const cleanupContext = snapshotOAuthSync(M.OAuthConnectedRevocationContext, {
                      namespace: "effect-auth/oauth-connected-revocation-context/v1",
                      jobId: yield* random(),
                      token: context,
                    });

                    cleanup = snapshotOAuthSync(M.OAuthConnectedRevocationJob, {
                      context: cleanupContext,
                      sealed: yield* seal({
                        context: cleanupContext,
                        material: snapshotOAuthSync(
                          M.OAuthConnectedTokenMaterial,
                          projected.material,
                        ),
                      }),
                    });
                  }

                  return snapshotOAuthSync(M.OAuthConnectedRefreshOutcome, {
                    _tag: "Refreshed",
                    grant: updated,
                    ...(cleanup ? { cleanup } : {}),
                  });
                }).pipe(
                  Effect.ensuring(Effect.sync(() => wipeConnectedMaterial(projected.material))),
                );
              }).pipe(Effect.ensuring(Effect.sync(() => wipeConnectedMaterial(material))));
            });

            const remaining = Math.max(
              1,
              owned.claimExpiresAtMillis - DateTime.toEpochMillis(yield* DateTime.now),
            );

            const exchanged = yield* Effect.exit(restore(connectedBounded(exchange, remaining)));

            if (Exit.isFailure(exchanged) && Cause.hasDies(exchanged.cause))
              yield* reportAuthFailure("oauth-connected", exchanged.cause);

            const outcome: M.OAuthConnectedRefreshOutcome = Exit.isSuccess(exchanged)
              ? exchanged.value
              : { _tag: "ReauthorizationRequired" };

            const finished = yield* Effect.exit(
              connectedBounded(
                settleRefresh(
                  {
                    claim: owned,
                    authorization,
                    outcome,
                  },
                  (value, journal) =>
                    journal.prepare(snapshotOAuthSync(M.OAuthConnectedRefreshSettlement, value)),
                ),
                policy.settlementTimeoutMillis,
              ),
            );

            if (Exit.isFailure(exchanged) && Cause.hasInterrupts(exchanged.cause))
              return yield* Effect.interrupt;
            if (Exit.isFailure(finished)) return yield* OAuthUnavailable.make({});
            const settled = yield* connectedRead(finished.value);

            if (settled._tag !== "Refreshed")
              return yield* M.OAuthConnectedReauthorizationRequired.make({});
            if (
              outcome._tag !== "Refreshed" ||
              !connectedSame(M.OAuthConnectedStoredGrant, settled.grant, outcome.grant)
            )
              return yield* OAuthUnavailable.make({});

            return snapshotOAuthSync(M.OAuthConnectedStoredGrant, settled.grant);
          }),
        );
      });

      const prepare = Effect.fn("OAuthConnectedAccess.prepare")(function* (
        invocation: AuthInvocation,
        raw: typeof M.OAuthConnectedUse.Type,
      ) {
        const caller = yield* connectedCaller(invocation);
        const input = yield* snapshotOAuth(M.OAuthConnectedUse, raw);

        const authorization = yield* connectedUseAuthorization(
          yield* authorize({
            invocation: caller,
            moduleId: id,
            purpose: "use",
            ...input,
          }),
          id,
          caller.subjectId,
          "use",
          input.grantId,
          input.profileKey,
        );

        const inspected = yield* inspectAccess({ authorization, ...input }).pipe(
          Effect.flatMap((v) => snapshotOAuth(M.OAuthConnectedAccessInspection, v)),
        );

        if (inspected._tag === "Busy") return yield* M.OAuthConnectedBusy.make({});
        if (inspected._tag === "ReauthorizationRequired")
          return yield* M.OAuthConnectedReauthorizationRequired.make({});
        if (inspected._tag !== "Target") return yield* OAuthRejected.make({});
        let grant = inspected.grant;

        if (
          grant.context.moduleId !== id ||
          grant.context.subjectId !== caller.subjectId ||
          grant.context.grantId !== input.grantId ||
          grant.context.configuration.profile.key !== input.profileKey ||
          !connectedProfile(policy, grant.context.configuration.profile)
        )
          return yield* OAuthRejected.make({});
        const now = DateTime.toEpochMillis(yield* DateTime.now);

        if (
          grant.context.configuration.profile.refresh !== "unsupported" &&
          grant.context.metadata.refreshUseUntilMillis !== undefined &&
          grant.context.metadata.refreshUseUntilMillis > now &&
          now + grant.context.configuration.profile.refreshAheadMillis >=
            grant.context.metadata.useUntilMillis
        )
          grant = yield* refresh(grant, authorization);

        const material = yield* open(snapshotOAuthSync(M.OAuthConnectedStoredGrant, grant)).pipe(
          Effect.flatMap((v) => snapshotOAuth(M.OAuthConnectedTokenMaterial, v)),
        );

        return yield* Effect.gen(function* () {
          yield* connectedUseAuthorization(
            authorization,
            id,
            caller.subjectId,
            "use",
            input.grantId,
            input.profileKey,
          );
          if (DateTime.toEpochMillis(yield* DateTime.now) >= grant.context.metadata.useUntilMillis)
            return yield* M.OAuthConnectedReauthorizationRequired.make({});
          const admissionId = yield* random();

          const receipt = yield* admitUse(
            {
              grant: snapshotOAuthSync(M.OAuthConnectedStoredGrant, grant),
              authorization,
              admissionId,
              lifetimeMillis: policy.useAdmissionLifetimeMillis,
            },
            (value, journal) =>
              journal.prepare(snapshotOAuthSync(M.OAuthConnectedUseAdmission, value)),
          );

          const admitted = yield* connectedRead(receipt);

          if (admitted._tag === "Busy") return yield* M.OAuthConnectedBusy.make({});
          if (admitted._tag === "ReauthorizationRequired")
            return yield* M.OAuthConnectedReauthorizationRequired.make({});
          if (admitted._tag !== "Admitted") return yield* OAuthRejected.make({});
          if (
            admitted.admissionId !== admissionId ||
            admitted.grantId !== grant.context.grantId ||
            admitted.tokenVersion !== grant.context.tokenVersion ||
            admitted.expiresAtMillis <= admitted.admittedAtMillis ||
            admitted.admittedAtMillis > DateTime.toEpochMillis(yield* DateTime.now) ||
            admitted.expiresAtMillis >
              Math.min(
                admitted.admittedAtMillis + policy.useAdmissionLifetimeMillis,
                grant.context.metadata.useUntilMillis,
                authorization.expiresAtMillis,
              ) ||
            DateTime.toEpochMillis(yield* DateTime.now) >= admitted.expiresAtMillis
          )
            return yield* OAuthUnavailable.make({});

          return {
            token: Redacted.make(Redacted.value(material.accessToken)),
            expiresAtMillis: admitted.expiresAtMillis,
          };
        }).pipe(Effect.ensuring(Effect.sync(() => wipeConnectedMaterial(material))));
      }, connectedSafe);

      const withAccessToken = <A, E, R>(
        invocation: AuthInvocation,
        input: typeof M.OAuthConnectedUse.Type,
        use: (token: Redacted.Redacted<string>) => Effect.Effect<A, E, R>,
      ): Effect.Effect<A, E | OAuthConnectedAccessFailure, R> =>
        prepare(invocation, input).pipe(
          Effect.flatMap(({ token, expiresAtMillis }) =>
            Effect.gen(function* () {
              if (DateTime.toEpochMillis(yield* DateTime.now) >= expiresAtMillis)
                return yield* OAuthUnavailable.make({});

              return yield* Effect.suspend(() => use(token)).pipe(Effect.interruptible);
            }).pipe(Effect.ensuring(Effect.sync(() => Redacted.wipeUnsafe(token)))),
          ),
        );

      return ConnectedAccess.of({ withAccessToken });
    }),
  );

  return { ConnectedAccess, accessLayer };
};
