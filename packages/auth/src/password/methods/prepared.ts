import {
  Context,
  Crypto,
  DateTime,
  Effect,
  Layer,
  Option,
  Predicate,
  Redacted,
  Schema,
  type Types,
} from "effect";
import { Base64Url } from "effect/encoding";

import type { PreparedCommit } from "../../hooks/commit";
import { LifecycleHooks } from "../../hooks/LifecycleHooks";
import { HookDenied } from "../../hooks/models";
import { LoginIdentifier } from "../../identity/models";
import type { AuthInvocation } from "../../operations/context";
import type { AuthOperationResult } from "../../operations/credentials";
import { makeOperation, operationGroup } from "../../operations/operation";
import type { ProofCompletionPlan } from "../../proofs/completion";
import type { ProofError } from "../../proofs/errors";
import { ProofBinding, ProofContinuationId } from "../../proofs/models";
import { Email } from "../../Schema";
import { assessAuthentication, snapshotAuthenticationEvidence } from "../../sessions/assurance";
import { AuthenticationAuthority } from "../../sessions/AuthenticationAuthority";
import { SessionInvalidationWindow, sessionInvalidationWindow } from "../../sessions/invalidation";
import {
  AuthenticationFlowId,
  type AuthenticationEvidence,
  type AuthenticationRequirement,
  type SessionCapabilities,
} from "../../sessions/models";
import type { SessionPolicy } from "../../sessions/policy";
import { NewPasswordRejected, PasswordCheckUnavailable } from "../errors";
import { NewPasswordCheck } from "../NewPasswordCheck";
import { PasswordHashing } from "../PasswordHashing";
import {
  PasswordActionRequired,
  PasswordMethodConfigurationError,
  PasswordMethodUnsupported,
  PasswordRejected,
  PasswordUnavailable,
} from "./errors";
import {
  PasswordActionChallenge,
  PasswordCommandId,
  type PasswordAction,
  type PasswordActionAuthorization,
  type PasswordReplacement,
  PasswordCredentialSnapshot,
} from "./models";
import { PasswordActionEvidence } from "./PasswordActionEvidence";
import { PasswordPersistence, type PasswordMutationInput } from "./PasswordPersistence";
import type {
  PasswordPreparedPersistence as Persistence,
  PasswordPreparedMutation,
} from "./PasswordPreparedPersistence";
import { type PasswordMethodPolicy, validatePasswordMethodPolicy } from "./policy";
import { makePasswordPreparation } from "./preparation";
import {
  PasswordPreparedRequirement,
  PasswordPreparedCredential,
  PasswordPreparedIntentId,
  PasswordPreparedResult,
  encodePasswordPreparedReady,
  snapshotPasswordPreparedReady,
  snapshotPasswordPreparedReservation,
  validatePasswordPreparedConfiguration,
  type PasswordPreparedConfiguration,
  type PasswordPreparedContext,
  type PasswordPreparedReady,
  type PasswordPreparedReservation,
} from "./preparedModels";
import {
  snapshotPasswordCredential,
  snapshotPasswordRequirement,
  snapshotPasswordRevision,
} from "./snapshot";
import {
  passwordCompletionFailure,
  passwordNoAmbient,
  passwordUnexpected,
  readPasswordCommit,
} from "./verification";

export interface ServiceId<Id extends string, Kind extends string> {
  readonly moduleId: Id;
  readonly kind: Kind;
}

interface Strategy {
  readonly policy: SessionPolicy;
  readonly capabilities: SessionCapabilities;
}
interface ResetProofs {
  readonly planComplete: (input: {
    readonly continuationId: ProofContinuationId;
    readonly binding: ProofBinding;
    readonly credential: Redacted.Redacted<string>;
  }) => Effect.Effect<ProofCompletionPlan, ProofError | HookDenied>;
}
const Password = Schema.RedactedFromValue(Schema.String.check(Schema.isMaxLength(65536)));
const SmallProof = Schema.RedactedFromValue(Schema.String.check(Schema.isMaxLength(4096)));

const Failure = Schema.Union([
  PasswordRejected,
  PasswordUnavailable,
  PasswordActionRequired,
  PasswordMethodUnsupported,
  NewPasswordRejected,
  PasswordCheckUnavailable,
  HookDenied,
]);

type Failure = typeof Failure.Type;
const MutationResult = Schema.Struct({ invalidation: SessionInvalidationWindow });

type MutationValue = AuthOperationResult<
  typeof MutationResult.Type | { readonly _tag: "Rejected" }
>;

export interface PasswordPreparedCompletionPlan<R> {
  readonly input: PasswordPreparedMutation;
  readonly commit: Effect.Effect<PreparedCommit<MutationValue>, Failure, R>;
}

export interface PasswordPreparedAuthorization {
  readonly evidence: AuthenticationEvidence;
  readonly requirement: AuthenticationRequirement;
}

const boundedRequirement = Effect.fn("PasswordPrepared.requirement")(function* (
  input: AuthenticationRequirement,
  maximumAgeMillis: number,
) {
  if (
    !Predicate.isObject(input) ||
    !Array.isArray(input.alternatives) ||
    input.alternatives.length > 16 ||
    input.alternatives.some(
      (a) => !Predicate.isObject(a) || !Array.isArray(a.factors) || a.factors.length > 3,
    )
  )
    return yield* PasswordActionRequired.make({});

  const value = yield* Schema.decodeEffect(PasswordPreparedRequirement)({
    ...input,
    maximumAgeMillis: Math.min(input.maximumAgeMillis, maximumAgeMillis),
  }).pipe(Effect.mapError(() => PasswordActionRequired.make({})));

  return yield* snapshotPasswordRequirement({
    ...value,
    maximumAgeMillis: Math.min(value.maximumAgeMillis, maximumAgeMillis),
  });
});

const sameRevision = (
  a: AuthenticationEvidence["revision"],
  b: AuthenticationEvidence["revision"],
) =>
  a.subjectId === b.subjectId &&
  a.securityRevision === b.securityRevision &&
  a.credentials.length === b.credentials.length &&
  a.credentials.every((c) =>
    b.credentials.some((d) => d.credentialId === c.credentialId && d.revision === c.revision),
  );

/** Optional factory. Begin commits admission before KDF; it is deliberately not a
 * rollback-safe plan. Reset proof requirements are per-call, so Add/Change-only
 * composition needs no proof, registration, claims or session-row capability. */
export const makePasswordPrepared = <
  const Id extends string,
  StrategyId,
  StrategyService extends Strategy,
  ResetId,
  ResetService extends ResetProofs,
>(
  moduleId: Id,
  input: {
    readonly policy: PasswordMethodPolicy;
    readonly strategy: Context.Service<StrategyId, StrategyService>;
    readonly reset: Context.Service<ResetId, ResetService>;
  },
  configuration: PasswordPreparedConfiguration,
) => {
  const configInput = {
    ...configuration,
    admission: {
      ...configuration.admission,
      identifier: { ...configuration?.admission?.identifier },
      subject: { ...configuration?.admission?.subject },
      action: { ...configuration?.admission?.action },
    },
  };

  const policyInput = {
    ...input.policy,
    attempts: {
      ...input.policy.attempts,
      identifier: { ...input.policy.attempts.identifier },
      subject: { ...input.policy.attempts.subject },
      action: { ...input.policy.attempts.action },
    },
  };

  const strategyTag = input.strategy,
    resetTag = input.reset;

  const PasswordPreparedPersistence = Context.Service<
    ServiceId<Id, "prepared-persistence">,
    Persistence
  >(`effect-auth/password/${moduleId}/PreparedPersistence`);

  const BeginAddInput = Schema.Struct({ commandId: PasswordCommandId, newPassword: Password });
  const BeginChangeInput = Schema.Struct({ ...BeginAddInput.fields, currentPassword: Password });

  const BeginResetInput = Schema.Struct({
    ...BeginAddInput.fields,
    flowId: AuthenticationFlowId.check(Schema.isMaxLength(256)),
    email: Schema.String.check(Schema.isMaxLength(320)).pipe(Schema.decodeTo(Email)),
    continuationId: ProofContinuationId,
    continuationCredential: SmallProof,
  });

  const CompleteInput = Schema.Struct({
    intentCredential: PasswordPreparedCredential,
    actionProof: Schema.optionalKey(SmallProof),
  });

  const CompleteResetInput = Schema.Struct({
    ...CompleteInput.fields,
    continuationCredential: SmallProof,
  });

  type CompletionInput = typeof CompleteInput.Type & {
    readonly continuationCredential?: Redacted.Redacted<string>;
  };
  type BeginValue = AuthOperationResult<PasswordPreparedResult>;

  const PasswordPrepared = Context.Service<
    ServiceId<Id, "prepared"> & { readonly reset: Types.Invariant<ResetId> },
    {
      readonly beginAdd: (
        invocation: AuthInvocation,
        input: typeof BeginAddInput.Type,
      ) => Effect.Effect<BeginValue, Failure>;
      readonly beginChange: (
        invocation: AuthInvocation,
        input: typeof BeginChangeInput.Type,
      ) => Effect.Effect<BeginValue, Failure>;
      readonly beginReset: (
        invocation: AuthInvocation,
        input: typeof BeginResetInput.Type,
      ) => Effect.Effect<BeginValue, Failure, ResetId>;
      readonly context: (
        invocation: AuthInvocation,
        credential: Redacted.Redacted<string>,
      ) => Effect.Effect<PasswordPreparedContext, Failure>;
      /** Nonconsuming Reset preflight before an interactive factor. Runs the
       * existing proof before hook; final authorized planning repeats all checks.
       * This context is neither a proof plan nor mutation authorization. */
      readonly resetContext: (
        invocation: AuthInvocation,
        input: {
          readonly intentCredential: Redacted.Redacted<string>;
          readonly continuationCredential: Redacted.Redacted<string>;
        },
      ) => Effect.Effect<PasswordPreparedContext, Failure, ResetId>;
      readonly planComplete: (
        invocation: AuthInvocation,
        input: CompletionInput,
      ) => Effect.Effect<
        PasswordPreparedCompletionPlan<typeof PasswordPreparedPersistence.Identifier>,
        Failure
      >;
      readonly planResetComplete: (
        invocation: AuthInvocation,
        input: CompletionInput,
      ) => Effect.Effect<
        PasswordPreparedCompletionPlan<typeof PasswordPreparedPersistence.Identifier>,
        Failure,
        ResetId
      >;
      readonly planCompleteAuthorized: (
        invocation: AuthInvocation,
        input: CompletionInput,
        authorization: PasswordPreparedAuthorization,
      ) => Effect.Effect<
        PasswordPreparedCompletionPlan<typeof PasswordPreparedPersistence.Identifier>,
        Failure
      >;
      readonly planResetCompleteAuthorized: (
        invocation: AuthInvocation,
        input: CompletionInput,
        authorization: PasswordPreparedAuthorization,
      ) => Effect.Effect<
        PasswordPreparedCompletionPlan<typeof PasswordPreparedPersistence.Identifier>,
        Failure,
        ResetId
      >;
      readonly cancel: (
        invocation: AuthInvocation,
        credential: Redacted.Redacted<string>,
      ) => Effect.Effect<PreparedCommit<AuthOperationResult<void>>, Failure>;
      readonly cleanup: (
        limit: number,
      ) => Effect.Effect<
        PreparedCommit<{ readonly removed: number; readonly hasMore: boolean }>,
        Failure
      >;
    }
  >(`effect-auth/password/${moduleId}/Prepared`);

  const layer = Layer.effect(
    PasswordPrepared,
    Effect.gen(function* () {
      if (!Schema.is(Schema.NonEmptyString.check(Schema.isMaxLength(128)))(moduleId))
        return yield* PasswordMethodConfigurationError.make({});

      const config = yield* validatePasswordPreparedConfiguration(configInput),
        policy = yield* validatePasswordMethodPolicy(policyInput);

      const persistence = yield* PasswordPreparedPersistence,
        store = yield* PasswordPersistence,
        hasher = yield* PasswordHashing,
        checker = yield* NewPasswordCheck,
        authority = yield* AuthenticationAuthority,
        actionEvidence = yield* PasswordActionEvidence,
        strategy = yield* strategyTag,
        hooks = yield* LifecycleHooks,
        crypto = yield* Crypto.Crypto;

      const preparationServices = Context.make(PasswordPersistence, store).pipe(
        Context.add(PasswordHashing, hasher),
        Context.add(NewPasswordCheck, checker),
        Context.add(AuthenticationAuthority, authority),
        Context.add(LifecycleHooks, hooks),
        Context.add(Crypto.Crypto, crypto),
      );

      const preparation = makePasswordPreparation({ moduleId, policy });

      const shared = {
        identifier: preparation.identifier,
        digest: (...args: Parameters<typeof preparation.digest>) =>
          preparation.digest(...args).pipe(Effect.provide(preparationServices)),
        newReplacement: (...args: Parameters<typeof preparation.newReplacement>) =>
          preparation.newReplacement(...args).pipe(Effect.provide(preparationServices)),
        event: (...args: Parameters<typeof preparation.event>) =>
          preparation.event(...args).pipe(Effect.provide(preparationServices)),
        verifyPassword: (...args: Parameters<typeof preparation.verifyPassword>) =>
          preparation.verifyPassword(...args).pipe(Effect.provide(preparationServices)),
      };

      const nonce = () =>
        passwordUnexpected(crypto.randomBytes(32)).pipe(
          Effect.map((bytes) => Base64Url.encode(bytes)),
        );

      const digestCredential = Effect.fn("PasswordPrepared.digestCredential")(function* (
        credential: Redacted.Redacted<string>,
      ) {
        yield* Schema.encodeEffect(PasswordPreparedCredential)(credential).pipe(
          Effect.mapError(() => PasswordRejected.make({})),
        );

        return yield* shared.digest([
          "effect-auth/password-intent/v1",
          moduleId,
          String(config.generation),
          Redacted.value(credential),
        ]);
      });

      const invalidation = (action: PasswordAction) =>
        sessionInvalidationWindow(
          action === "reset-password" ? "password-reset" : "credential-change",
          strategy.capabilities,
          strategy.policy,
        );

      const allowed = (
        invocation: AuthInvocation,
        record: {
          readonly action: PasswordAction;
          readonly revision: AuthenticationEvidence["revision"];
        },
      ) =>
        record.action === "reset-password" ||
        (invocation._tag === "Authenticated" && invocation.subjectId === record.revision.subjectId);

      const ready = Effect.fn("PasswordPrepared.ready")(function* (
        invocation: AuthInvocation,
        credential: Redacted.Redacted<string>,
      ) {
        const digest = yield* digestCredential(credential),
          selected = yield* persistence.context({
            moduleId,
            generation: config.generation,
            digest,
            nowMillis: DateTime.toEpochMillis(yield* DateTime.now),
          });

        const record = yield* snapshotPasswordPreparedReady(selected.record),
          currentRequirement = yield* boundedRequirement(
            selected.currentRequirement,
            policy.maximumEvidenceAgeMillis,
          ),
          now = DateTime.toEpochMillis(yield* DateTime.now);

        if (
          record.moduleId !== moduleId ||
          record.generation !== config.generation ||
          record.digest !== digest ||
          !allowed(invocation, record) ||
          now < record.issuedAtMillis ||
          now >= record.expiresAtMillis ||
          record.expiresAtMillis > record.retainUntilMillis
        )
          return yield* PasswordRejected.make({});
        if (
          record.challenge.moduleId !== moduleId ||
          record.challenge.action !== record.action ||
          record.challenge.commandId !== record.commandId ||
          !sameRevision(record.challenge.revision, record.revision)
        )
          return yield* PasswordRejected.make({});
        if (
          (yield* challenge({ ...record, _tag: "Preparing" }, record.replacement)).bindingDigest !==
          record.challenge.bindingDigest
        )
          return yield* PasswordUnavailable.make({});

        return { record, currentRequirement };
      });

      const resetPlan = Effect.fn("PasswordPrepared.resetPlan")(function* (
        record: PasswordPreparedReady,
        credential?: Redacted.Redacted<string>,
      ) {
        if (record.action !== "reset-password") return undefined;
        if (record.reset === undefined || credential === undefined)
          return yield* PasswordRejected.make({});

        const proof = yield* (yield* resetTag)
          .planComplete({ ...record.reset, credential })
          .pipe(Effect.mapError(passwordCompletionFailure));

        if (!(yield* store.checkReset(proof.input))) return yield* PasswordRejected.make({});

        return proof;
      });

      const challenge = Effect.fn("PasswordPrepared.challenge")(function* (
        reservation: PasswordPreparedReservation,
        replacement: PasswordReplacement,
      ) {
        const revision = reservation.revision;

        const bindingDigest = yield* shared.digest([
          "effect-auth/password-action/v1",
          moduleId,
          reservation.action,
          reservation.commandId,
          revision.subjectId,
          revision.securityRevision,
          reservation.credential?.credentialId ?? "",
          ...[...revision.credentials]
            .sort((a, b) =>
              a.credentialId < b.credentialId ? -1 : a.credentialId > b.credentialId ? 1 : 0,
            )
            .flatMap((c) => [c.credentialId, c.revision]),
          replacement.normalization,
          Redacted.value(replacement.verifier),
        ]);

        return Object.freeze({
          ...PasswordActionChallenge.make({
            moduleId,
            action: reservation.action,
            commandId: reservation.commandId,
            revision,
            bindingDigest,
            ...(reservation.credential === undefined
              ? {}
              : { targetCredentialId: reservation.credential.credentialId }),
          }),
          revision: snapshotPasswordRevision(revision),
        });
      });

      const begin = Effect.fn("PasswordPrepared.begin")(function* (
        invocation: AuthInvocation,
        request: typeof BeginAddInput.Type & {
          readonly currentPassword?: Redacted.Redacted<string>;
        },
        action: PasswordAction,
        recovery?: {
          readonly proof: ProofCompletionPlan;
          readonly credential: import("./models").PasswordCredentialSnapshot;
          readonly continuationId: ProofContinuationId;
          readonly binding: ProofBinding;
        },
      ): Effect.fn.Return<BeginValue, Failure> {
        yield* passwordNoAmbient();
        if (
          policy.requireImmediateInvalidation &&
          strategy.capabilities.subjectInvalidation !== "immediate"
        )
          return yield* PasswordMethodUnsupported.make({});
        if (action !== "reset-password" && invocation._tag !== "Authenticated")
          return yield* PasswordRejected.make({});

        const subjectId =
          recovery?.credential.revision.subjectId ??
          (invocation._tag === "Authenticated" ? invocation.subjectId : undefined);

        if (subjectId === undefined) return yield* PasswordRejected.make({});
        const intentId = PasswordPreparedIntentId.make(yield* nonce());

        const reserved = yield* readPasswordCommit(
          yield* persistence.reserve(
            {
              moduleId,
              generation: config.generation,
              intentId,
              commandId: request.commandId,
              action,
              subjectId,
              nowMillis: DateTime.toEpochMillis(yield* DateTime.now),
              policy: config,
              invalidation: invalidation(action),
              ...(recovery === undefined
                ? {}
                : {
                    reset: { continuationId: recovery.continuationId, binding: recovery.binding },
                    completion: recovery.proof.input,
                  }),
            },
            (decision, journal) => journal.prepare(decision),
          ),
        );

        if (reserved._tag === "Existing")
          return { value: { _tag: "AlreadyExists" }, credentialCommands: [] };

        const reservation = yield* snapshotPasswordPreparedReservation(reserved.reservation),
          now = DateTime.toEpochMillis(yield* DateTime.now);

        if (
          reservation.intentId !== intentId ||
          reservation.moduleId !== moduleId ||
          reservation.generation !== config.generation ||
          reservation.commandId !== request.commandId ||
          reservation.action !== action ||
          reservation.revision.subjectId !== subjectId ||
          now < reservation.createdAtMillis ||
          now >= reservation.preparationExpiresAtMillis ||
          reservation.preparationExpiresAtMillis >
            reservation.createdAtMillis + config.preparationLifetimeMillis ||
          reservation.retainUntilMillis > reservation.createdAtMillis + config.retentionMillis
        )
          return yield* PasswordRejected.make({});

        const expectedWindow = invalidation(action),
          actualWindow = reservation.invalidation;

        if (
          actualWindow.trigger !== expectedWindow.trigger ||
          actualWindow.existingSessions !== expectedWindow.existingSessions ||
          actualWindow.maximumExposureMillis !== expectedWindow.maximumExposureMillis ||
          actualWindow.oldAuthenticationEvidence !== expectedWindow.oldAuthenticationEvidence
        )
          return yield* PasswordUnavailable.make({});
        if (recovery !== undefined) {
          const encodeBinding = Schema.encodeEffect(Schema.fromJsonString(ProofBinding)),
            encodeCredential = Schema.encodeEffect(
              Schema.fromJsonString(PasswordCredentialSnapshot),
            );

          if (
            reservation.reset?.continuationId !== recovery.continuationId ||
            reservation.credential === undefined ||
            (yield* passwordUnexpected(encodeBinding(reservation.reset.binding))) !==
              (yield* passwordUnexpected(encodeBinding(recovery.binding))) ||
            (yield* passwordUnexpected(encodeCredential(reservation.credential))) !==
              (yield* passwordUnexpected(encodeCredential(recovery.credential)))
          )
            return yield* PasswordUnavailable.make({});
        }
        let baseEvidence: AuthenticationEvidence | undefined;

        if (action === "change-password") {
          if (reservation.credential === undefined || request.currentPassword === undefined)
            return yield* PasswordRejected.make({});

          const verified = yield* shared.verifyPassword(
            {
              flowId: AuthenticationFlowId.make(request.commandId),
              email: reservation.credential.identifier.value as Email,
              password: request.currentPassword,
            },
            "change",
            subjectId,
          );

          if (!sameRevision(verified.evidence.revision, reservation.revision))
            return yield* PasswordRejected.make({});
          const encode = Schema.encodeEffect(Schema.fromJsonString(PasswordCredentialSnapshot));

          if (
            (yield* passwordUnexpected(encode(verified.credential))) !==
            (yield* passwordUnexpected(encode(reservation.credential)))
          )
            return yield* PasswordRejected.make({});
          baseEvidence = verified.evidence;
        }

        const replacement = yield* shared.newReplacement(
          request.newPassword,
          reservation.credential?.identifier.value as Email | undefined,
        );

        const bound = yield* challenge(reservation, replacement),
          credential = Redacted.make(yield* nonce()),
          digest = yield* digestCredential(credential),
          issuedAtMillis = DateTime.toEpochMillis(yield* DateTime.now);

        if (issuedAtMillis >= reservation.preparationExpiresAtMillis)
          return yield* PasswordRejected.make({});

        const record = yield* snapshotPasswordPreparedReady({
          ...reservation,
          _tag: "Ready",
          replacement,
          challenge: bound,
          digest,
          issuedAtMillis,
          expiresAtMillis: Math.min(
            issuedAtMillis + config.lifetimeMillis,
            reservation.retainUntilMillis,
          ),
          ...(baseEvidence === undefined
            ? {}
            : {
                baseEvidence: {
                  ...baseEvidence,
                  flowId: AuthenticationFlowId.make(request.commandId),
                  bindingDigest: bound.bindingDigest,
                },
              }),
        });

        const published = yield* readPasswordCommit(
          yield* persistence.publishReady(
            { reservation, ready: record, nowMillis: DateTime.toEpochMillis(yield* DateTime.now) },
            (decision, journal) =>
              journal.prepare(
                decision === "published"
                  ? {
                      value: {
                        _tag: "Prepared" as const,
                        intentId: record.intentId,
                        expiresAtMillis: record.expiresAtMillis,
                      },
                      credentialCommands: [
                        {
                          _tag: "Issue" as const,
                          slot: "password-intent" as const,
                          credential,
                          expiresAtMillis: record.expiresAtMillis,
                        },
                      ],
                    }
                  : { value: { _tag: "Rejected" as const }, credentialCommands: [] },
              ),
          ),
        );

        if (published.value._tag === "Rejected") return yield* PasswordRejected.make({});

        return { value: published.value, credentialCommands: published.credentialCommands };
      });

      const finish = Effect.fn("PasswordPrepared.finish")(function* (
        invocation: AuthInvocation,
        request: CompletionInput,
        initial: PasswordPreparedReady,
        currentRequirement: AuthenticationRequirement,
        grant: PasswordPreparedAuthorization,
        proof?: ProofCompletionPlan,
      ): Effect.fn.Return<
        PasswordPreparedCompletionPlan<typeof PasswordPreparedPersistence.Identifier>,
        Failure
      > {
        const provided = yield* snapshotAuthenticationEvidence(grant.evidence).pipe(
          Effect.mapError(() => PasswordActionRequired.make({})),
        );

        if (
          provided.flowId !== AuthenticationFlowId.make(initial.commandId) ||
          provided.bindingDigest !== initial.challenge.bindingDigest ||
          provided.revision.subjectId !== initial.revision.subjectId ||
          provided.revision.securityRevision !== initial.revision.securityRevision ||
          initial.revision.credentials.some(
            (c) =>
              !provided.revision.credentials.some(
                (d) => c.credentialId === d.credentialId && c.revision === d.revision,
              ),
          )
        )
          return yield* PasswordActionRequired.make({});

        const evidence = yield* snapshotAuthenticationEvidence({
          ...provided,
          proofs: [...(initial.baseEvidence?.proofs ?? []), ...provided.proofs],
        }).pipe(Effect.mapError(() => PasswordActionRequired.make({})));

        const providerRequirement = yield* boundedRequirement(
            grant.requirement,
            policy.maximumEvidenceAgeMillis,
          ),
          capturedRequirement = yield* boundedRequirement(
            initial.capturedRequirement,
            policy.maximumEvidenceAgeMillis,
          );

        const validate = Effect.fn("PasswordPrepared.validateAuthorization")(function* (
          current: AuthenticationRequirement,
        ) {
          const now = DateTime.toEpochMillis(yield* DateTime.now),
            age = Math.min(
              providerRequirement.maximumAgeMillis,
              capturedRequirement.maximumAgeMillis,
              current.maximumAgeMillis,
              policy.maximumEvidenceAgeMillis,
            );

          if (
            now >= initial.expiresAtMillis ||
            initial.baseEvidence?.proofs.some(
              (p) =>
                now < DateTime.toEpochMillis(p.verifiedAt) ||
                now - DateTime.toEpochMillis(p.verifiedAt) >= age,
            )
          )
            return yield* PasswordActionRequired.make({});
          for (const requirement of [providerRequirement, capturedRequirement, current])
            if (
              !(yield* assessAuthentication(evidence, requirement).pipe(
                Effect.mapError(() => PasswordActionRequired.make({})),
              )).satisfied
            )
              return yield* PasswordActionRequired.make({});
        });

        yield* validate(currentRequirement);

        const changed = yield* shared.event(
          "credential-change",
          initial.credential?.identifier ??
            LoginIdentifier.make({ namespace: "subject", value: initial.revision.subjectId }),
          initial.revision.subjectId,
        );

        const latest = yield* ready(invocation, request.intentCredential);

        if (
          (yield* encodePasswordPreparedReady(latest.record)) !==
          (yield* encodePasswordPreparedReady(initial))
        )
          return yield* PasswordRejected.make({});
        yield* validate(latest.currentRequirement);
        if (proof !== undefined && !(yield* store.checkReset(proof.input)))
          return yield* PasswordRejected.make({});

        const authorization: PasswordActionAuthorization = Object.freeze({
          challenge: initial.challenge,
          evidence,
          requirement: providerRequirement,
        });

        const mutation: PasswordMutationInput = Object.freeze({
          moduleId,
          commandId: initial.commandId,
          expectedRevision: initial.revision,
          ...(initial.credential === undefined ? {} : { credential: initial.credential }),
          replacement: initial.replacement,
          authorization,
          invalidation: initial.invalidation,
        });

        const plan: PasswordPreparedMutation = Object.freeze({
          intent: initial,
          mutation,
          capturedRequirement,
          currentRequirement: latest.currentRequirement,
          nowMillis: DateTime.toEpochMillis(yield* DateTime.now),
        });

        const prepare = (
          decision: "changed" | "rejected",
          journal: import("../../hooks/commit").CommitJournal,
        ): PreparedCommit<MutationValue> => {
          if (decision === "changed") journal.stage(changed);

          return journal.prepare({
            value:
              decision === "changed"
                ? { invalidation: initial.invalidation }
                : { _tag: "Rejected" },
            credentialCommands:
              decision === "changed"
                ? [
                    { _tag: "Clear", slot: "password-intent" },
                    { _tag: "Clear", slot: "session" },
                    { _tag: "Clear", slot: "pending-proof" },
                    ...(initial.action === "reset-password"
                      ? [{ _tag: "Clear" as const, slot: "proof-continuation" as const }]
                      : []),
                  ]
                : [],
          });
        };

        const commit = Effect.gen(function* () {
          const owner = yield* PasswordPreparedPersistence;

          return yield* proof === undefined
            ? owner.complete(plan, prepare)
            : owner.resetWithProof({ ...plan, completion: proof }, prepare);
        });

        return Object.freeze({ input: plan, commit });
      });

      const authorize = (
        invocation: AuthInvocation,
        request: CompletionInput,
        record: PasswordPreparedReady,
        recovery?: ProofCompletionPlan,
      ) =>
        actionEvidence.verify({
          challenge: record.challenge,
          invocation,
          ...(request.actionProof === undefined ? {} : { proof: request.actionProof }),
          ...(record.baseEvidence === undefined
            ? {}
            : { currentPasswordEvidence: record.baseEvidence }),
          ...(recovery === undefined ? {} : { recovery: recovery.input }),
        });

      const loadOrdinary = Effect.fn("PasswordPrepared.loadOrdinary")(function* (
        invocation: AuthInvocation,
        request: CompletionInput,
      ) {
        yield* passwordNoAmbient();
        const current = yield* ready(invocation, request.intentCredential);

        if (current.record.action === "reset-password") return yield* PasswordRejected.make({});

        return current;
      });

      const contextOf = (record: PasswordPreparedReady): PasswordPreparedContext =>
        Object.freeze({
          intentId: record.intentId,
          action: record.action,
          challenge: record.challenge,
          capturedRequirement: record.capturedRequirement,
          ...(record.baseEvidence === undefined ? {} : { baseEvidence: record.baseEvidence }),
          expiresAtMillis: record.expiresAtMillis,
        });

      return PasswordPrepared.of({
        beginAdd: (invocation, request) => begin(invocation, request, "add-password"),
        beginChange: (invocation, request) => begin(invocation, request, "change-password"),
        beginReset: Effect.fn("PasswordPrepared.beginReset")(function* (invocation, request) {
          yield* passwordNoAmbient();

          const identifier = shared.identifier(request.email),
            target = yield* store.recoveryTarget({ moduleId, identifier });

          if (Option.isNone(target)) return yield* PasswordRejected.make({});
          const credential = yield* snapshotPasswordCredential(target.value);

          if (
            credential.moduleId !== moduleId ||
            credential.identifier.value !== request.email ||
            credential.identifier.namespace !== "email" ||
            credential.identifierVerifiedAtMillis === undefined
          )
            return yield* PasswordRejected.make({});

          const binding: ProofBinding = {
            _tag: "Subject",
            flowId: request.flowId,
            identifier,
            revision: credential.revision,
            contextDigest: yield* shared.digest([
              "effect-auth/password-reset/v1",
              moduleId,
              request.flowId,
              request.email,
            ]),
          };

          const proof = yield* (yield* resetTag)
            .planComplete({
              continuationId: request.continuationId,
              binding,
              credential: request.continuationCredential,
            })
            .pipe(Effect.mapError(passwordCompletionFailure));

          if (!(yield* store.checkReset(proof.input))) return yield* PasswordRejected.make({});

          return yield* begin(invocation, request, "reset-password", {
            proof,
            credential,
            continuationId: request.continuationId,
            binding,
          });
        }),
        context: Effect.fn("PasswordPrepared.context")(function* (invocation, credential) {
          const { record } = yield* ready(invocation, credential);

          return contextOf(record);
        }),
        resetContext: Effect.fn("PasswordPrepared.resetContext")(function* (invocation, request) {
          yield* passwordNoAmbient();
          const { record } = yield* ready(invocation, request.intentCredential);

          if (record.action !== "reset-password") return yield* PasswordRejected.make({});
          yield* resetPlan(record, request.continuationCredential);
          const latest = yield* ready(invocation, request.intentCredential);

          if (
            (yield* encodePasswordPreparedReady(latest.record)) !==
            (yield* encodePasswordPreparedReady(record))
          )
            return yield* PasswordRejected.make({});

          return contextOf(latest.record);
        }),
        planComplete: Effect.fn("PasswordPrepared.planComplete")(function* (invocation, request) {
          const current = yield* loadOrdinary(invocation, request);

          return yield* finish(
            invocation,
            request,
            current.record,
            current.currentRequirement,
            yield* authorize(invocation, request, current.record),
          );
        }),
        planCompleteAuthorized: Effect.fn("PasswordPrepared.planCompleteAuthorized")(
          function* (invocation, request, authorization) {
            const current = yield* loadOrdinary(invocation, request);

            return yield* finish(
              invocation,
              request,
              current.record,
              current.currentRequirement,
              authorization,
            );
          },
        ),
        planResetComplete: Effect.fn("PasswordPrepared.planResetComplete")(
          function* (invocation, request) {
            yield* passwordNoAmbient();
            const current = yield* ready(invocation, request.intentCredential);

            if (current.record.action !== "reset-password") return yield* PasswordRejected.make({});
            const proof = yield* resetPlan(current.record, request.continuationCredential);

            return yield* finish(
              invocation,
              request,
              current.record,
              current.currentRequirement,
              yield* authorize(invocation, request, current.record, proof),
              proof,
            );
          },
        ),
        planResetCompleteAuthorized: Effect.fn("PasswordPrepared.planResetCompleteAuthorized")(
          function* (invocation, request, authorization) {
            yield* passwordNoAmbient();
            const current = yield* ready(invocation, request.intentCredential);

            if (current.record.action !== "reset-password") return yield* PasswordRejected.make({});
            const proof = yield* resetPlan(current.record, request.continuationCredential);

            return yield* finish(
              invocation,
              request,
              current.record,
              current.currentRequirement,
              authorization,
              proof,
            );
          },
        ),
        cancel: Effect.fn("PasswordPrepared.cancel")(function* (invocation, credential) {
          yield* passwordNoAmbient();
          const { record } = yield* ready(invocation, credential);

          return yield* persistence.cancel(
            { record, nowMillis: DateTime.toEpochMillis(yield* DateTime.now) },
            (cancelled, journal) =>
              journal.prepare({
                value: undefined,
                credentialCommands: cancelled
                  ? [{ _tag: "Clear" as const, slot: "password-intent" as const }]
                  : [],
              }),
          );
        }),
        cleanup: Effect.fn("PasswordPrepared.cleanup")(function* (limit) {
          yield* passwordNoAmbient();
          yield* Schema.decodeEffect(
            Schema.Int.check(Schema.isBetween({ minimum: 1, maximum: 1000 })),
          )(limit).pipe(Effect.mapError(() => PasswordRejected.make({})));

          return yield* persistence.cleanup(
            { moduleId, limit, nowMillis: DateTime.toEpochMillis(yield* DateTime.now) },
            (value, journal) => journal.prepare(value),
          );
        }),
      });
    }),
  );

  const BeginAdd = makeOperation(`${moduleId}/prepared/add/begin`, {
    payload: BeginAddInput,
    success: PasswordPreparedResult,
    error: Failure,
    access: "authenticated",
    exposure: "public",
    replay: "idempotent",
    credentials: true,
  });

  const BeginChange = makeOperation(`${moduleId}/prepared/change/begin`, {
    payload: BeginChangeInput,
    success: PasswordPreparedResult,
    error: Failure,
    access: "authenticated",
    exposure: "public",
    replay: "idempotent",
    credentials: true,
  });

  const BeginReset = makeOperation(`${moduleId}/prepared/reset/begin`, {
    payload: BeginResetInput,
    success: PasswordPreparedResult,
    error: Failure,
    access: "any",
    exposure: "public",
    replay: "idempotent",
    credentials: true,
  });

  const CompleteAdd = makeOperation(`${moduleId}/prepared/add/complete`, {
    payload: CompleteInput,
    success: MutationResult,
    error: Failure,
    access: "authenticated",
    exposure: "public",
    replay: "single-use",
    credentials: true,
  });

  const CompleteChange = makeOperation(`${moduleId}/prepared/change/complete`, {
    payload: CompleteInput,
    success: MutationResult,
    error: Failure,
    access: "authenticated",
    exposure: "public",
    replay: "single-use",
    credentials: true,
  });

  const CompleteReset = makeOperation(`${moduleId}/prepared/reset/complete`, {
    payload: CompleteResetInput,
    success: MutationResult,
    error: Failure,
    access: "any",
    exposure: "public",
    replay: "single-use",
    credentials: true,
  });

  const Cancel = makeOperation(`${moduleId}/prepared/cancel`, {
    payload: Schema.Struct({ intentCredential: PasswordPreparedCredential }),
    success: Schema.Void,
    error: Failure,
    access: "any",
    exposure: "public",
    replay: "idempotent",
    credentials: true,
  });

  const Cleanup = makeOperation(`${moduleId}/prepared/cleanup`, {
    payload: Schema.Struct({
      limit: Schema.Int.check(Schema.isBetween({ minimum: 1, maximum: 1000 })),
    }),
    success: Schema.Struct({ removed: Schema.Natural, hasMore: Schema.Boolean }),
    error: Failure,
    access: "system",
    replay: "idempotent",
  });

  const publicMutation = (value: MutationValue) =>
    "invalidation" in value.value
      ? Effect.succeed({ value: value.value, credentialCommands: value.credentialCommands })
      : Effect.fail(PasswordRejected.make({}));

  const ordinaryComplete = Effect.fn("PasswordPreparedOperation.complete")(function* (
    action: "add-password" | "change-password",
    request: typeof CompleteInput.Type,
    invocation: AuthInvocation,
  ) {
    const service = yield* PasswordPrepared;

    if ((yield* service.context(invocation, request.intentCredential)).action !== action)
      return yield* PasswordRejected.make({});

    return yield* readPasswordCommit(
      yield* (yield* service.planComplete(invocation, request)).commit,
    ).pipe(Effect.flatMap(publicMutation));
  });

  const handlersLayer = Layer.mergeAll(
    BeginAdd.credentialHandlerLayer(
      Effect.fn("PasswordPreparedOperation.beginAdd")(function* (request, invocation) {
        return yield* (yield* PasswordPrepared).beginAdd(invocation, request);
      }),
    ),
    BeginChange.credentialHandlerLayer(
      Effect.fn("PasswordPreparedOperation.beginChange")(function* (request, invocation) {
        return yield* (yield* PasswordPrepared).beginChange(invocation, request);
      }),
    ),
    CompleteAdd.credentialHandlerLayer((request, invocation) =>
      ordinaryComplete("add-password", request, invocation),
    ),
    CompleteChange.credentialHandlerLayer((request, invocation) =>
      ordinaryComplete("change-password", request, invocation),
    ),
    Cancel.credentialHandlerLayer(
      Effect.fn("PasswordPreparedOperation.cancel")(function* (request, invocation) {
        return yield* readPasswordCommit(
          yield* (yield* PasswordPrepared).cancel(invocation, request.intentCredential),
        );
      }),
    ),
    Cleanup.handlerLayer(
      Effect.fn("PasswordPreparedOperation.cleanup")(function* (request) {
        return yield* readPasswordCommit(yield* (yield* PasswordPrepared).cleanup(request.limit));
      }),
    ),
  );

  const resetHandlersLayer = Layer.mergeAll(
    BeginReset.credentialHandlerLayer(
      Effect.fn("PasswordPreparedOperation.beginReset")(function* (request, invocation) {
        return yield* (yield* PasswordPrepared).beginReset(invocation, request);
      }),
    ),
    CompleteReset.credentialHandlerLayer(
      Effect.fn("PasswordPreparedOperation.completeReset")(function* (request, invocation) {
        return yield* readPasswordCommit(
          yield* (yield* (yield* PasswordPrepared).planResetComplete(invocation, request)).commit,
        ).pipe(Effect.flatMap(publicMutation));
      }),
    ),
  );

  const operations = { BeginAdd, BeginChange, CompleteAdd, CompleteChange, Cancel, Cleanup },
    resetOperations = { BeginReset, CompleteReset };

  return Object.freeze({
    PasswordPrepared,
    PasswordPreparedPersistence,
    layer,
    handlersLayer,
    resetHandlersLayer,
    operations,
    resetOperations,
    resetGroup: operationGroup(...Object.values(resetOperations)),
    group: operationGroup(...Object.values(operations)),
    schemas: {
      BeginAddInput,
      BeginChangeInput,
      BeginResetInput,
      CompleteInput,
      CompleteResetInput,
      Result: PasswordPreparedResult,
    },
  });
};
