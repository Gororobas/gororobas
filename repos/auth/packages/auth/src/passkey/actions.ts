import {
  Cause,
  Clock,
  Context,
  Crypto,
  DateTime,
  Effect,
  Fiber,
  Layer,
  Redacted,
  Schema,
} from "effect";
import { Base64Url } from "effect/encoding";

import { hasCommitScope, type PreparedCommit } from "../hooks/commit";
import { LifecycleHooks } from "../hooks/LifecycleHooks";
import { lifecycleSnapshot } from "../hooks/models";
import { reportAuthFailure } from "../internal/diagnostics";
import type { AuthOperationResult } from "../operations/credentials";
import { makeRequestBinding } from "../operations/requestBinding";
import { AuthenticationAuthority } from "../sessions/AuthenticationAuthority";
import { AuthenticationFlowId, type AuthenticationEvidence } from "../sessions/models";
import {
  PasskeyActionRequired,
  PasskeyConfigurationError,
  type PasskeyFailure,
  PasskeyMethodUnsupported,
  PasskeyProtocolRejected,
  PasskeyRejected,
  PasskeyUnavailable,
} from "./errors";
import {
  type PasskeyClaim,
  PasskeyProfile as PasskeyProfileSchema,
  PasskeyAccess,
  PasskeyAssertion,
  PasskeyAssertionVerified,
  PasskeyAttestation,
  PasskeyAuthenticationOptions,
  type PasskeyAuthenticationStarted,
  PasskeyBegin,
  PasskeyCeremony,
  PasskeyClaimDecision,
  PasskeyComplete,
  PasskeyContext,
  PasskeyCredential,
  PasskeyEvidence,
  PasskeyEnrollmentSnapshot,
  PasskeyIssueDecision,
  PasskeyModuleId,
  PasskeyProtocolCredentialId,
  type PasskeyPurpose,
  PasskeyRegistrationOptions,
  PasskeyRegistrationVerified,
  PasskeyRevision,
  PasskeyTarget,
  PasskeyUserHandle,
  PasskeyRegistrationComplete,
  type PasskeyRegistrationStarted,
  type PasskeyDescriptor,
} from "./models";
import type { PasskeyConfig } from "./PasskeyConfig";
import { PasskeyCredentials } from "./PasskeyCredentials";
import { PasskeyEnrollmentContext } from "./PasskeyEnrollmentContext";
import { PasskeyPersistence, type PreparePasskeyCommit } from "./PasskeyPersistence";
import { PasskeyProtocol } from "./PasskeyProtocol";
import { PasskeyMethodPolicy, validatePasskeyPolicy } from "./policy";
import { freezePasskey, samePasskey, snapshotPasskey, snapshotPasskeySync } from "./snapshot";

export const passkeyNoAmbient = Effect.fn("Passkey.noAmbient")(function* () {
  if (yield* hasCommitScope) return yield* PasskeyMethodUnsupported.make({});
});

export const readPasskeyCommit = <A>(receipt: PreparedCommit<A>) =>
  receipt.read.pipe(Effect.mapError(() => PasskeyUnavailable.make({})));

export const passkeyFailure = (error: { readonly _tag: string }) =>
  error._tag === "HookDenied"
    ? error
    : error._tag === "SessionUnavailable"
      ? PasskeyUnavailable.make({})
      : PasskeyRejected.make({});

export const capturePasskeyPolicy = (input: PasskeyMethodPolicy) => {
  try {
    return validatePasskeyPolicy(snapshotPasskeySync(PasskeyMethodPolicy, input));
  } catch {
    return Effect.fail(PasskeyConfigurationError.make({}));
  }
};

const clear = { _tag: "Clear", slot: "request-binding" } as const;

const prepare = <A>(value: A, journal: Parameters<PreparePasskeyCommit<A, A>>[1]) =>
  journal.prepare(value);

const now = DateTime.now.pipe(Effect.map(DateTime.toEpochMillis));

const bounded = <A, E, R>(operation: Effect.Effect<A, E, R>, millis: number) =>
  Effect.gen(function* () {
    const fiber = yield* operation.pipe(Effect.interruptible, Effect.forkChild);

    return yield* Fiber.join(fiber).pipe(
      Effect.timeout(Math.max(1, millis)),
      Effect.ensuring(Fiber.interrupt(fiber)),
    );
  });

export const passkeyUnexpected = <A, E, R>(operation: Effect.Effect<A, E, R>) =>
  operation.pipe(
    Effect.catchCause((cause): Effect.Effect<never, E | PasskeyUnavailable> =>
      Cause.hasDies(cause)
        ? reportAuthFailure("passkey-core", cause).pipe(
            Effect.andThen(Effect.fail(PasskeyUnavailable.make({}))),
          )
        : Effect.failCause(cause),
    ),
  );

interface RegistrationDraft {
  readonly ceremony: PasskeyCeremony;
  readonly started: PasskeyRegistrationStarted;
  readonly credentialCommands: AuthOperationResult<void>["credentialCommands"];
}

const envelope = Schema.Struct({
  id: PasskeyProtocolCredentialId,
  rawId: PasskeyProtocolCredentialId,
  type: Schema.Literal("public-key"),
  response: Schema.Struct({ userHandle: Schema.optionalKey(Schema.NullOr(PasskeyUserHandle)) }),
});

const contextPurpose = {
  SignIn: "sign-in",
  Registration: "registration",
  Enrollment: "enrollment",
  Pending: "pending",
  StepUp: "step-up",
  Action: "action",
} as const;

/** Private ceremony machinery shared by separately enabled facets. No generic
 * evidence operation is installed. Callers authenticate target contexts first. */
export const makePasskeyCeremony = <const Id extends string, const Purpose extends PasskeyPurpose>(
  moduleId: Id,
  source: Effect.Effect<PasskeyMethodPolicy, PasskeyConfigurationError, PasskeyConfig>,
  purpose: Purpose,
) => {
  const binding = makeRequestBinding(moduleId, `passkey-${purpose}`);

  const make = Effect.gen(function* () {
    const policy = yield* source;

    const id = yield* Schema.decodeEffect(PasskeyModuleId)(moduleId).pipe(
      Effect.mapError(() => PasskeyConfigurationError.make({})),
    );

    const protocol = yield* PasskeyProtocol;
    const persistence = yield* PasskeyPersistence;
    const binder = yield* binding.RequestBinding;
    const crypto = yield* Crypto.Crypto;
    const hooks = yield* LifecycleHooks;

    const random = () =>
      crypto.randomBytes(32).pipe(
        Effect.map(Base64Url.encode),
        Effect.mapError(() => PasskeyUnavailable.make({})),
      );

    const profile = (profileId: string) =>
      Effect.fromNullishOr(policy.profiles.find((value) => value.profileId === profileId)).pipe(
        Effect.mapError(() => PasskeyRejected.make({})),
      );

    const access = Effect.fn("Passkey.access")(function* (
      input: Pick<PasskeyComplete, "flowId" | "bindingCredential">,
    ) {
      const verified = yield* binder
        .verify(input.flowId, input.bindingCredential)
        .pipe(
          Effect.mapError((error) =>
            error._tag === "RequestBindingUnavailable"
              ? PasskeyUnavailable.make({})
              : PasskeyRejected.make({}),
          ),
        );

      return yield* snapshotPasskey(PasskeyAccess, {
        moduleId: id,
        generation: policy.generation,
        purpose,
        flowId: input.flowId,
        requestBindingVerifier: verified.verifier,
        requestBindingExpiresAtMillis: verified.expiresAtMillis,
        nowMillis: yield* now,
      });
    });

    const inspect = Effect.fn("Passkey.inspect")(function* (
      input: Pick<PasskeyComplete, "flowId" | "bindingCredential">,
      expected?: PasskeyContext,
    ) {
      yield* passkeyNoAmbient();
      input = yield* snapshotPasskey(
        Schema.toType(
          Schema.Struct({
            flowId: PasskeyComplete.fields.flowId,
            bindingCredential: PasskeyComplete.fields.bindingCredential,
          }),
        ),
        input,
      );

      const key = yield* access(input),
        raw = yield* persistence.context(key);

      if (raw === undefined) return yield* PasskeyRejected.make({});

      const ceremony = yield* snapshotPasskey(PasskeyCeremony, raw),
        clock = yield* now;

      if (
        ceremony.moduleId !== id ||
        ceremony.generation !== policy.generation ||
        ceremony.purpose !== purpose ||
        contextPurpose[ceremony.context._tag] !== purpose ||
        ceremony.flowId !== input.flowId ||
        ceremony.requestBindingVerifier !== key.requestBindingVerifier ||
        ceremony.requestBindingExpiresAtMillis !== key.requestBindingExpiresAtMillis ||
        ceremony.issuedAtMillis > clock ||
        ceremony.expiresAtMillis <= clock ||
        ceremony.expiresAtMillis > ceremony.requestBindingExpiresAtMillis ||
        ceremony.expiresAtMillis - ceremony.issuedAtMillis > policy.lifetimeMillis ||
        ceremony.retentionUntilMillis !== ceremony.issuedAtMillis + policy.retentionMillis ||
        ceremony.claimLifetimeMillis !== policy.claimLifetimeMillis
      )
        return yield* PasskeyRejected.make({});
      if (
        !(yield* samePasskey(
          PasskeyProfileSchema,
          ceremony.profile,
          yield* profile(ceremony.profile.profileId),
        ))
      )
        return yield* PasskeyRejected.make({});
      if (
        expected !== undefined &&
        !(yield* samePasskey(PasskeyContext, ceremony.context, expected))
      )
        return yield* PasskeyRejected.make({});

      return { key, ceremony };
    });

    const before = Effect.fn("Passkey.before")(function* (context: PasskeyContext) {
      yield* hooks.before(
        lifecycleSnapshot({
          action:
            purpose === "registration"
              ? "registration"
              : purpose === "enrollment"
                ? "credential-change"
                : purpose === "sign-in"
                  ? "sign-in"
                  : "proof-verification",
          operation: `${moduleId}/passkey/${purpose}`,
          method: "passkey",
          identifiers: [],
          ...(context._tag === "Enrollment"
            ? { subjectId: context.revision.subjectId }
            : "target" in context
              ? { subjectId: context.target.revision.subjectId }
              : {}),
        }),
      );
    });

    const newCeremony = Effect.fn("Passkey.newCeremony")(function* (
      input: PasskeyBegin,
      context: PasskeyContext,
      allowed: ReadonlyArray<typeof PasskeyDescriptor.Type>,
    ) {
      yield* passkeyNoAmbient();
      const selected = yield* profile(input.profileId);

      if (contextPurpose[context._tag] !== purpose) return yield* PasskeyRejected.make({});
      const fixed = yield* snapshotPasskey(PasskeyContext, context);

      yield* before(fixed);

      const issued = yield* binder
        .issue(input.flowId)
        .pipe(Effect.mapError(() => PasskeyUnavailable.make({})));

      const command = issued.credentialCommands[0];

      if (command?._tag !== "Issue") return yield* PasskeyUnavailable.make({});

      const verified = yield* binder
        .verify(input.flowId, command.credential)
        .pipe(Effect.mapError(() => PasskeyUnavailable.make({})));

      const timestamp = yield* now;

      const expiresAtMillis = Math.min(
        timestamp + policy.lifetimeMillis,
        verified.expiresAtMillis,
        "target" in fixed ? fixed.target.expiresAtMillis : Infinity,
        "target" in fixed && fixed.target.requirement !== undefined
          ? timestamp + fixed.target.requirement.maximumAgeMillis
          : Infinity,
      );

      if (expiresAtMillis <= timestamp) return yield* PasskeyRejected.make({});

      const ceremony = yield* snapshotPasskey(PasskeyCeremony, {
        moduleId: id,
        generation: policy.generation,
        flowId: input.flowId,
        commandId: input.commandId,
        purpose,
        profile: selected,
        challenge: yield* random(),
        requestBindingVerifier: verified.verifier,
        requestBindingExpiresAtMillis: verified.expiresAtMillis,
        issuedAtMillis: timestamp,
        expiresAtMillis,
        retentionUntilMillis: timestamp + policy.retentionMillis,
        claimLifetimeMillis: policy.claimLifetimeMillis,
        allowedCredentials: allowed,
        context: fixed,
      });

      return { ceremony, commands: issued.credentialCommands };
    });

    const beginAuthentication = Effect.fn("Passkey.beginAuthentication")(function* (
      input: PasskeyBegin,
      context: PasskeyContext,
      allowed: ReadonlyArray<typeof PasskeyDescriptor.Type> = [],
    ) {
      input = yield* snapshotPasskey(PasskeyBegin, input);
      const { ceremony, commands } = yield* newCeremony(input, context, allowed);

      if (
        context._tag === "SignIn" &&
        (!ceremony.profile.primarySignIn ||
          ceremony.profile.residentKey !== "required" ||
          ceremony.profile.userVerification !== "required")
      )
        return yield* PasskeyRejected.make({});

      const options = yield* snapshotPasskey(
        PasskeyAuthenticationOptions,
        yield* protocol
          .prepareAuthentication({
            profile: ceremony.profile,
            challenge: ceremony.challenge,
            timeoutMillis: ceremony.expiresAtMillis - ceremony.issuedAtMillis,
            allowedCredentials: ceremony.allowedCredentials,
          })
          .pipe(Effect.mapError(() => PasskeyUnavailable.make({}))),
      );

      if (
        options.challenge !== ceremony.challenge ||
        options.rpId !== ceremony.profile.rpId ||
        options.userVerification !== ceremony.profile.userVerification ||
        options.timeout > ceremony.expiresAtMillis - ceremony.issuedAtMillis ||
        options.timeout <= 0 ||
        options.allowCredentials.length !== ceremony.allowedCredentials.length ||
        options.allowCredentials.some(
          (item, index) => item.id !== ceremony.allowedCredentials[index]?.id,
        )
      )
        return yield* PasskeyUnavailable.make({});

      const result = yield* snapshotPasskey(
        PasskeyIssueDecision,
        yield* readPasskeyCommit(yield* persistence.issue({ ceremony, policy }, prepare)),
      );

      if (result._tag !== "Issued") return yield* PasskeyRejected.make({});
      if (
        !(yield* samePasskey(PasskeyCeremony, result.ceremony, ceremony)) ||
        (yield* now) >= ceremony.expiresAtMillis
      )
        return yield* PasskeyUnavailable.make({});

      return {
        value: { flowId: input.flowId, expiresAtMillis: ceremony.expiresAtMillis, options },
        credentialCommands: commands,
      } satisfies AuthOperationResult<PasskeyAuthenticationStarted>;
    }, passkeyUnexpected);

    const prepareRegistration = Effect.fn("Passkey.prepareRegistration")(function* (
      input: PasskeyBegin,
      context: Extract<PasskeyContext, { readonly _tag: "Registration" | "Enrollment" }>,
      excluded: ReadonlyArray<typeof PasskeyDescriptor.Type>,
    ) {
      input = yield* snapshotPasskey(PasskeyBegin, input);
      context = yield* snapshotPasskey(
        Schema.Union([PasskeyContext.members[1], PasskeyContext.members[2]]),
        context,
      );
      const { ceremony, commands } = yield* newCeremony(input, context, excluded);

      const options = yield* snapshotPasskey(
        PasskeyRegistrationOptions,
        yield* protocol
          .prepareRegistration({
            profile: ceremony.profile,
            challenge: ceremony.challenge,
            timeoutMillis: ceremony.expiresAtMillis - ceremony.issuedAtMillis,
            userHandle: context.userHandle,
            name: context.name,
            displayName: context._tag === "Registration" ? context.displayName : context.name,
            excludedCredentials: excluded,
          })
          .pipe(Effect.mapError(() => PasskeyUnavailable.make({}))),
      );

      if (
        options.challenge !== ceremony.challenge ||
        options.rp.id !== ceremony.profile.rpId ||
        options.rp.name !== ceremony.profile.rpName ||
        options.user.id !== context.userHandle ||
        options.user.name !== context.name ||
        options.user.displayName !==
          (context._tag === "Registration" ? context.displayName : context.name) ||
        options.attestation !== "none" ||
        options.timeout <= 0 ||
        options.timeout > ceremony.expiresAtMillis - ceremony.issuedAtMillis ||
        options.authenticatorSelection.userVerification !== ceremony.profile.userVerification ||
        options.authenticatorSelection.residentKey !== ceremony.profile.residentKey ||
        options.pubKeyCredParams.length !== ceremony.profile.algorithms.length ||
        options.pubKeyCredParams.some(
          (item, index) => item.alg !== ceremony.profile.algorithms[index],
        ) ||
        options.excludeCredentials.length !== excluded.length ||
        options.excludeCredentials.some((item, index) => item.id !== excluded[index]?.id)
      )
        return yield* PasskeyUnavailable.make({});

      const draft: RegistrationDraft = {
        ceremony,
        started: { flowId: input.flowId, expiresAtMillis: ceremony.expiresAtMillis, options },
        credentialCommands: commands,
      };

      freezePasskey(draft);

      return draft;
    }, passkeyUnexpected);

    const acceptRegistrationIssue = Effect.fn("Passkey.acceptRegistrationIssue")(function* (
      draft: RegistrationDraft,
      decision: PasskeyIssueDecision,
    ) {
      const result = yield* snapshotPasskey(PasskeyIssueDecision, decision);

      if (result._tag !== "Issued") return yield* PasskeyRejected.make({});
      if (
        !(yield* samePasskey(PasskeyCeremony, result.ceremony, draft.ceremony)) ||
        (yield* now) >= draft.ceremony.expiresAtMillis
      )
        return yield* PasskeyUnavailable.make({});

      return {
        value: draft.started,
        credentialCommands: draft.credentialCommands,
      } satisfies AuthOperationResult<PasskeyRegistrationStarted>;
    }, passkeyUnexpected);

    const claim = Effect.fn("Passkey.claim")(function* (
      inspected: Effect.Success<ReturnType<typeof inspect>>,
      credential?: PasskeyCredential,
    ) {
      const claimId = yield* random();
      const startedNanos = yield* Clock.monotonicTimeNanos;

      const decision = yield* snapshotPasskey(
        PasskeyClaimDecision,
        yield* readPasskeyCommit(
          yield* persistence.claim(
            {
              ...inspected,
              access: inspected.key,
              policy,
              claimId,
              ...(credential === undefined ? {} : { credential }),
            },
            prepare,
          ),
        ),
      );

      if (decision._tag !== "Claimed") return yield* PasskeyRejected.make({});

      const result = decision.claim;

      const diagnostic = {
        claimIdMatches: result.claimId === claimId,
        ceremonyMatches: yield* samePasskey(PasskeyCeremony, result.ceremony, inspected.ceremony),
        claimChronologyValid:
          result.claimedAtMillis >= inspected.ceremony.issuedAtMillis &&
          result.claimedAtMillis < inspected.ceremony.expiresAtMillis,
        claimExpiryMatches:
          result.claimExpiresAtMillis ===
          Math.min(
            result.claimedAtMillis + policy.claimLifetimeMillis,
            inspected.ceremony.expiresAtMillis,
          ),
      };

      if (!Object.values(diagnostic).every(Boolean))
        return yield* Effect.die(new globalThis.Error("Invalid passkey claim receipt")).pipe(
          passkeyUnexpected,
          Effect.annotateLogs({ passkeyGuard: "claim", ...diagnostic }),
        );

      // Persistence owns epoch timestamps and final liveness. Count its granted
      // duration from before the claim round trip, using only our monotonic clock.
      // This conservatively subtracts transport/commit time without assuming that
      // the database and application wall clocks agree. Never persist this timer.
      return {
        claim: result,
        deadlineNanos:
          startedNanos + BigInt(result.claimExpiresAtMillis - result.claimedAtMillis) * 1_000_000n,
      };
    });

    const terminal = Effect.fn("Passkey.terminal")(function* (
      claimed: PasskeyClaim,
      outcome: "Rejected" | "Ambiguous",
    ) {
      const result = yield* readPasskeyCommit(
        yield* persistence.settle(
          { claim: claimed, outcome: { _tag: outcome }, nowMillis: yield* now },
          prepare,
        ),
      );

      if (result !== outcome) return yield* PasskeyUnavailable.make({});
    });

    const verify = <A, E, R>(
      claimed: PasskeyClaim,
      deadlineNanos: bigint,
      operation: Effect.Effect<A, E, R>,
    ) =>
      Effect.gen(function* () {
        const remaining = Number(deadlineNanos - (yield* Clock.monotonicTimeNanos)) / 1_000_000;

        if (remaining <= 0) return yield* PasskeyRejected.make({});

        return yield* bounded(operation, remaining);
      }).pipe(
        passkeyUnexpected,
        Effect.catch((error) =>
          terminal(
            claimed,
            error instanceof PasskeyProtocolRejected || error instanceof PasskeyRejected
              ? "Rejected"
              : "Ambiguous",
          ).pipe(
            Effect.andThen(
              Effect.fail(
                error instanceof PasskeyProtocolRejected || error instanceof PasskeyRejected
                  ? PasskeyRejected.make({})
                  : PasskeyUnavailable.make({}),
              ),
            ),
          ),
        ),
        Effect.onInterrupt(() => terminal(claimed, "Ambiguous").pipe(Effect.ignore)),
      );

    const authentication = Effect.fn("Passkey.authentication")(function* (
      input: PasskeyComplete,
      expected: PasskeyContext,
    ) {
      input = yield* snapshotPasskey(Schema.toType(PasskeyComplete), input);
      const inspected = yield* inspect(input, expected);

      yield* before(inspected.ceremony.context);

      yield* Schema.decodeEffect(Schema.toType(PasskeyAssertion))(input.response).pipe(
        Effect.mapError(() => PasskeyRejected.make({})),
      );

      const decoded = yield* Schema.decodeEffect(Schema.fromJsonString(envelope))(
        Redacted.value(input.response),
      ).pipe(Effect.result);

      let credential: PasskeyCredential | undefined;

      if (decoded._tag === "Success" && decoded.success.id === decoded.success.rawId) {
        const found = yield* (yield* PasskeyCredentials).lookup({
          rpId: inspected.ceremony.profile.rpId,
          protocolCredentialId: decoded.success.id,
        });

        if (found !== undefined) credential = yield* snapshotPasskey(PasskeyCredential, found);
      }
      const { claim: claimed, deadlineNanos } = yield* claim(inspected, credential);

      const verified = yield* verify(
        claimed,
        deadlineNanos,
        Effect.gen(function* () {
          if (credential === undefined || decoded._tag !== "Success")
            return yield* PasskeyRejected.make({});

          const ceremony = claimed.ceremony,
            context = ceremony.context;

          const supplied = decoded.success.response.userHandle ?? undefined;

          if (
            !credential.active ||
            credential.rpId !== ceremony.profile.rpId ||
            credential.protocolCredentialId !== decoded.success.id ||
            credential.profile.rpId !== credential.rpId ||
            (credential.backupState && !credential.backupEligible) ||
            !credential.revision.credentials.some(
              (item) => item.credentialId === credential.credentialId,
            )
          )
            return yield* PasskeyRejected.make({});
          if (
            ceremony.allowedCredentials.length > 0 &&
            !ceremony.allowedCredentials.some((item) => item.id === credential.protocolCredentialId)
          )
            return yield* PasskeyRejected.make({});
          if (
            (supplied !== undefined && supplied !== credential.userHandle) ||
            (context._tag === "SignIn" &&
              (supplied === undefined ||
                !credential.primarySignIn ||
                !credential.enrollmentUserVerified ||
                !credential.profile.primarySignIn ||
                credential.profile.userVerification !== "required"))
          )
            return yield* PasskeyRejected.make({});
          if (
            "target" in context &&
            context.target.revision.subjectId !== credential.revision.subjectId
          )
            return yield* PasskeyRejected.make({});
          const original = "target" in context ? context.target.revision : credential.revision;

          const ids = [
            ...new Set([
              ...original.credentials.map((item) => item.credentialId),
              credential.credentialId,
            ]),
          ];

          const revision = yield* snapshotPasskey(
            PasskeyRevision,
            yield* (yield* AuthenticationAuthority)
              .capture(original.subjectId, ids)
              .pipe(
                Effect.mapError((error) =>
                  error._tag === "SessionUnavailable"
                    ? PasskeyUnavailable.make({})
                    : PasskeyRejected.make({}),
                ),
              ),
          );

          if (
            revision.securityRevision !== original.securityRevision ||
            revision.subjectId !== original.subjectId ||
            original.credentials.some(
              (item) =>
                !revision.credentials.some(
                  (current) =>
                    current.credentialId === item.credentialId &&
                    current.revision === item.revision,
                ),
            ) ||
            credential.revision.securityRevision !== original.securityRevision ||
            credential.revision.credentials.some(
              (item) =>
                item.credentialId === credential.credentialId &&
                !revision.credentials.some(
                  (current) =>
                    current.credentialId === item.credentialId &&
                    current.revision === item.revision,
                ),
            )
          )
            return yield* PasskeyRejected.make({});

          const result = yield* snapshotPasskey(
            PasskeyAssertionVerified,
            yield* protocol.verifyAuthentication({
              ceremony,
              credential,
              response: input.response,
            }),
          );

          if (
            result.protocolCredentialId !== credential.protocolCredentialId ||
            result.userHandle !== supplied ||
            result.backupEligible !== credential.backupEligible ||
            (result.backupState && !result.backupEligible) ||
            (ceremony.profile.userVerification === "required" && !result.userVerified) ||
            (!credential.backupEligible &&
              (credential.counter > 0 || result.counter > 0) &&
              result.counter <= credential.counter) ||
            (yield* Clock.monotonicTimeNanos) >= deadlineNanos
          )
            return yield* PasskeyRejected.make({});

          const evidence = yield* snapshotPasskey(PasskeyEvidence, {
            revision,
            flowId:
              "target" in context
                ? context.target.flowId
                : AuthenticationFlowId.make(ceremony.flowId),
            bindingDigest:
              "target" in context ? context.target.bindingDigest : ceremony.requestBindingVerifier,
            proofs: [
              {
                method: "passkey",
                credentialId: credential.credentialId,
                factors: ["possession"],
                userVerified: result.userVerified,
                phishingResistant: true,
                verifiedAt: DateTime.makeUnsafe(ceremony.issuedAtMillis),
              },
            ],
          });

          return { evidence, credential, ceremony, assertion: result };
        }),
      );

      const settled = yield* readPasskeyCommit(
        yield* persistence.settle(
          {
            claim: claimed,
            outcome: {
              _tag: "Assertion",
              credential: verified.credential,
              assertion: verified.assertion,
              evidence: verified.evidence,
            },
            nowMillis: yield* now,
          },
          prepare,
        ),
      );

      if (settled !== "Verified") return yield* PasskeyRejected.make({});

      return { ...verified, credentialCommands: [clear] as const };
    }, passkeyUnexpected);

    const verifyRegistration = Effect.fn("Passkey.verifyRegistration")(function* (
      input: PasskeyRegistrationComplete,
      expected: PasskeyContext | undefined,
    ) {
      input = yield* snapshotPasskey(Schema.toType(PasskeyRegistrationComplete), input);
      const inspected = yield* inspect(input, expected);

      yield* before(inspected.ceremony.context);

      if (
        inspected.ceremony.context._tag !== "Registration" &&
        inspected.ceremony.context._tag !== "Enrollment"
      )
        return yield* PasskeyRejected.make({});
      yield* Schema.decodeEffect(Schema.toType(PasskeyAttestation))(input.response).pipe(
        Effect.mapError(() => PasskeyRejected.make({})),
      );
      const { claim: claimed, deadlineNanos } = yield* claim(inspected);

      const verified = yield* verify(
        claimed,
        deadlineNanos,
        Effect.gen(function* () {
          const result = yield* snapshotPasskey(
            PasskeyRegistrationVerified,
            yield* protocol.verifyRegistration({
              ceremony: claimed.ceremony,
              response: input.response,
            }),
          );

          if (
            (result.backupState && !result.backupEligible) ||
            (claimed.ceremony.profile.userVerification === "required" && !result.userVerified) ||
            !claimed.ceremony.profile.algorithms.includes(result.algorithm) ||
            (yield* Clock.monotonicTimeNanos) >= deadlineNanos
          )
            return yield* PasskeyRejected.make({});

          return result;
        }),
      );

      return Object.freeze({ claim: claimed, verified });
    }, passkeyUnexpected);

    const exclusions = Effect.fn("Passkey.exclusions")(function* (
      profileId: string,
      subjectId: (typeof PasskeyRevision.Type)["subjectId"],
    ) {
      const selected = yield* profile(profileId);

      const captured = yield* (yield* PasskeyEnrollmentContext).capture({
        moduleId: id,
        rpId: selected.rpId,
        subjectId,
      });

      if (captured === undefined || captured.revision.subjectId !== subjectId)
        return yield* PasskeyRejected.make({});

      return yield* snapshotPasskey(PasskeyEnrollmentSnapshot, captured);
    });

    return {
      policy,
      profile,
      random,
      inspect,
      beginAuthentication,
      prepareRegistration,
      acceptRegistrationIssue,
      authentication,
      verifyRegistration,
      exclusions,
      clear,
    };
  });

  return { binding, make };
};

/** Trusted target adapters only. Possession of a public flow/digest is not target
 * authorization; callers MUST resolve the private target capability each time. */
export const makePasskeyActions = <const Id extends string>(
  moduleId: Id,
  source: Effect.Effect<PasskeyMethodPolicy, PasskeyConfigurationError, PasskeyConfig>,
) => {
  const ceremony = makePasskeyCeremony(moduleId, source, "action");

  const PasskeyActionAssertions = Context.Service<
    { readonly moduleId: Id; readonly kind: "passkey-actions" },
    {
      readonly begin: (
        input: PasskeyBegin,
        target: PasskeyTarget,
      ) => Effect.Effect<AuthOperationResult<PasskeyAuthenticationStarted>, PasskeyFailure>;
      readonly complete: (
        input: PasskeyComplete,
        target: PasskeyTarget,
      ) => Effect.Effect<
        {
          readonly evidence: AuthenticationEvidence;
          readonly credentialCommands: AuthOperationResult<void>["credentialCommands"];
        },
        PasskeyFailure
      >;
    }
  >(`effect-auth/PasskeyActionAssertions/${moduleId.length}:${moduleId}`);

  const layer = Layer.effect(
    PasskeyActionAssertions,
    Effect.gen(function* () {
      const runtime = yield* ceremony.make,
        authority = yield* AuthenticationAuthority,
        credentials = yield* PasskeyCredentials,
        enrollment = yield* PasskeyEnrollmentContext;

      return PasskeyActionAssertions.of({
        begin: Effect.fn("PasskeyActionAssertions.begin")(
          function* (input, target) {
            const authority = yield* AuthenticationAuthority;
            const fixed = yield* snapshotPasskey(PasskeyTarget, target);
            const captured = yield* runtime.exclusions(input.profileId, fixed.revision.subjectId);

            const current = yield* authority
              .capture(
                fixed.revision.subjectId,
                fixed.revision.credentials.map((item) => item.credentialId),
              )
              .pipe(Effect.mapError(() => PasskeyActionRequired.make({})));

            if (
              !(yield* samePasskey(PasskeyRevision, current, fixed.revision)) ||
              captured.revision.securityRevision !== fixed.revision.securityRevision
            )
              return yield* PasskeyActionRequired.make({});

            return yield* runtime.beginAuthentication(
              input,
              { _tag: "Action", target: fixed },
              captured.credentials,
            );
          },
          passkeyUnexpected,
          Effect.provideService(AuthenticationAuthority, authority),
          Effect.provideService(PasskeyEnrollmentContext, enrollment),
        ),
        complete: Effect.fn("PasskeyActionAssertions.complete")(
          function* (input, target) {
            const fixed = yield* snapshotPasskey(PasskeyTarget, target);

            return yield* runtime.authentication(input, { _tag: "Action", target: fixed });
          },
          passkeyUnexpected,
          Effect.provideService(AuthenticationAuthority, authority),
          Effect.provideService(PasskeyCredentials, credentials),
        ),
      });
    }),
  );

  return Object.freeze({ PasskeyActionAssertions, binding: ceremony.binding, layer });
};
