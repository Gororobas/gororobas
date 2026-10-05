import { Context, DateTime, Effect, Layer, Redacted, Schema } from "effect";

import { makeAuthStrategy } from "../auth/AuthStrategy";
import { hasCommitScope, type PreparedCommit } from "../hooks/commit";
import { LifecycleHooks } from "../hooks/LifecycleHooks";
import { LifecycleEventId, lifecycleEvent, lifecycleSnapshot } from "../hooks/models";
import type { AuthInvocation } from "../operations/context";
import type { AuthOperationResult } from "../operations/credentials";
import { operationGroup } from "../operations/operation";
import type { AuthRevealCommand } from "../operations/reveals";
import { assessAuthentication } from "../sessions/assurance";
import { AuthenticationAuthority } from "../sessions/AuthenticationAuthority";
import { sessionInvalidationWindow } from "../sessions/invalidation";
import {
  AuthenticationEvidence,
  AuthenticationFlowId,
  AuthenticationRequirement,
} from "../sessions/models";
import type { makeSessionModule } from "../sessions/module";
import {
  make as makeTotpContract,
  BeginInput,
  ConfirmInput,
  ManageInput,
  VerifyInput,
  RecoveryInput,
  StepUpInput,
} from "../TotpContract";
import { base32 } from "./encoding";
import type { TotpFailure } from "./errors";
import {
  TotpActionRequired,
  TotpConfigurationError,
  TotpRejected,
  TotpUnavailable,
} from "./errors";
import {
  type TotpEnrollmentStarted,
  type TotpManagementResult,
  type TotpRecoveryReset,
  TotpActionAuthorization,
  TotpActionChallenge,
  TotpPolicy,
  type TotpSnapshot,
} from "./models";
import { TotpActionEvidence } from "./TotpActionEvidence";
import { TotpCryptography } from "./TotpCryptography";
import { TotpPersistence } from "./TotpPersistence";

const mapFailure = (error: { _tag: string }) =>
  error._tag === "HookDenied"
    ? (error as Extract<TotpFailure, { _tag: "HookDenied" }>)
    : error._tag === "SessionUnavailable"
      ? TotpUnavailable.make({})
      : TotpRejected.make({});

const read = <A>(commit: PreparedCommit<A>) =>
  commit.read.pipe(Effect.mapError(() => TotpUnavailable.make({})));

const decode = <S extends Schema.Codec<unknown, unknown, never, never>>(
  schema: S,
  value: S["Type"],
) =>
  Schema.decodeEffect(Schema.toType(schema))(value).pipe(
    Effect.mapError(() => TotpRejected.make({})),
  );

const noAmbient = Effect.gen(function* () {
  if (yield* hasCommitScope) return yield* TotpUnavailable.make({});
});

const strong = (age: number) =>
  AuthenticationRequirement.make({
    maximumAgeMillis: age,
    alternatives: [
      {
        factors: ["knowledge", "possession"],
        minimumCredentials: 2,
        userVerified: false,
        phishingResistant: false,
      },
      {
        factors: ["possession"],
        minimumCredentials: 1,
        userVerified: true,
        phishingResistant: true,
      },
    ],
  });

export const makeTotpModule = <
  const Id extends string,
  const SessionId extends string,
  Claims extends Schema.Codec<unknown, unknown, unknown, unknown>,
>(
  moduleId: Id,
  options: TotpPolicy,
  sessions: ReturnType<typeof makeSessionModule<SessionId, Claims>>,
) => {
  const policySource = Effect.try({
    try: () => Object.freeze(Schema.decodeSync(TotpPolicy)({ ...options })),
    catch: () => TotpConfigurationError.make({}),
  });

  const make = Effect.gen(function* () {
    const policy = yield* policySource,
      persistence = yield* TotpPersistence,
      actions = yield* TotpActionEvidence,
      authority = yield* AuthenticationAuthority,
      completion = yield* sessions.AuthenticationCompletion,
      stepUp = yield* sessions.SessionStepUp,
      strategy = yield* sessions.SessionStrategy,
      hooks = yield* LifecycleHooks;

    const {
      decryptSecret,
      digest,
      encryptSecret,
      generateSecret,
      matchCode,
      newRecoveryCodes,
      randomId,
      recoveryDigest,
    } = yield* TotpCryptography;

    if (
      policy.requireImmediateInvalidation &&
      strategy.capabilities.subjectInvalidation !== "immediate"
    )
      return yield* TotpConfigurationError.make({});

    const invalidation = sessionInvalidationWindow(
      "factor-reset",
      strategy.capabilities,
      strategy.policy,
    );

    const snapshot = Effect.fn("Totp.snapshot")(function* (
      subjectId: TotpSnapshot["revision"]["subjectId"],
    ) {
      const result = yield* persistence.snapshot({ moduleId, subjectId });

      if (result === undefined) return yield* TotpRejected.make({});

      return result;
    });

    const authenticated = Effect.fn("Totp.authenticated")(function* (invocation: AuthInvocation) {
      yield* noAmbient;
      if (invocation._tag !== "Authenticated") return yield* TotpRejected.make({});

      return yield* snapshot(invocation.subjectId);
    });

    const authorize = Effect.fn("Totp.authorize")(function* (
      invocation: AuthInvocation,
      captured: TotpSnapshot,
      action: typeof TotpActionChallenge.Type.action,
      input: typeof ManageInput.Type,
      detail: string,
    ) {
      const challenge = TotpActionChallenge.make({
        moduleId,
        action,
        commandId: input.commandId,
        flowId: AuthenticationFlowId.make(input.commandId),
        revision: captured.revision,
        bindingDigest: digest(
          `${moduleId.length}:${moduleId}/${action}/${input.commandId}/${captured.record?.version ?? "none"}/${detail}`,
        ),
      });

      const evidence = yield* actions.verify({
        invocation,
        challenge,
        ...(input.actionProof === undefined ? {} : { proof: input.actionProof }),
      });

      if (
        evidence.flowId !== challenge.flowId ||
        evidence.bindingDigest !== challenge.bindingDigest ||
        evidence.revision.subjectId !== captured.revision.subjectId ||
        evidence.revision.securityRevision !== captured.revision.securityRevision
      )
        return yield* TotpActionRequired.make({});

      const requirement = yield* authority
        .requirements(evidence)
        .pipe(Effect.mapError(() => TotpActionRequired.make({})));

      const central = yield* assessAuthentication(evidence, {
        ...requirement,
        maximumAgeMillis: Math.min(requirement.maximumAgeMillis, policy.maximumEvidenceAgeMillis),
      }).pipe(Effect.mapError(() => TotpActionRequired.make({})));

      const freshStrong =
        (captured.record === null || captured.record.secret === null) &&
        (action === "enroll" || action === "confirm")
          ? central
          : yield* assessAuthentication(evidence, strong(policy.maximumEvidenceAgeMillis)).pipe(
              Effect.mapError(() => TotpActionRequired.make({})),
            );

      if (!central.satisfied || !freshStrong.satisfied) return yield* TotpActionRequired.make({});

      return TotpActionAuthorization.make({ challenge, evidence, requirement });
    });

    const commit = Effect.fn("Totp.commit")(function* (
      captured: TotpSnapshot,
      commandId: string,
      action: Parameters<TotpPersistence["Service"]["mutate"]>[0]["action"],
      authorization?: typeof TotpActionAuthorization.Type,
    ) {
      const event = lifecycleEvent({
        id: LifecycleEventId.make(`totp/${moduleId}/${commandId}`),
        occurredAtMillis: DateTime.toEpochMillis(yield* DateTime.now),
        snapshot: lifecycleSnapshot({
          action: "credential-change",
          operation: `${moduleId}/totp/${action._tag.toLowerCase()}`,
          subjectId: captured.revision.subjectId,
          method: action._tag === "Recovery" ? "recovery-code" : "totp",
          identifiers: [],
        }),
      });

      if (action._tag !== "Verify" && (action._tag !== "Recovery" || action.reset))
        yield* hooks.before(event.snapshot);

      const receipt = yield* persistence.mutate(
        {
          snapshot: captured,
          moduleId,
          subjectId: captured.revision.subjectId,
          commandId,
          policy,
          action,
          ...(authorization === undefined ? {} : { authorization }),
        },
        (decision, journal) => {
          if (decision._tag === "Accepted" && action._tag !== "Verify") journal.stage(event);

          return journal.prepare(decision);
        },
      );

      const decision = yield* read(receipt);

      if (decision._tag === "Rejected") return yield* TotpRejected.make({});

      return decision.record;
    });

    const matched = Effect.fn("Totp.matched")(function* (
      captured: TotpSnapshot,
      code: string,
      pending = false,
    ) {
      const record = captured.record,
        envelope = pending ? record?.pending?.secret : record?.secret;

      if (record === null || envelope === null || envelope === undefined)
        return yield* TotpRejected.make({});
      const nowMillis = DateTime.toEpochMillis(yield* DateTime.now);

      return yield* Effect.acquireUseRelease(
        decryptSecret(
          {
            moduleId,
            subjectId: record.subjectId,
            credentialId: record.credentialId,
            revision: pending ? record.pending!.revision : record.revision,
          },
          envelope,
        ),
        (secret) => Effect.sync(() => matchCode(secret, code, nowMillis, policy.clockSkewSteps)),
        (secret) => Effect.sync(() => secret.fill(0)),
      );
    });

    const evidenceFor = Effect.fn("Totp.evidence")(function* (
      captured: TotpSnapshot,
      target: {
        readonly revision: TotpSnapshot["revision"];
        readonly flowId: AuthenticationFlowId;
        readonly bindingDigest: typeof TotpActionChallenge.Type.bindingDigest;
      },
      method: "totp" | "recovery-code",
    ) {
      const record = captured.record;

      if (
        record === null ||
        record.secret === null ||
        captured.revision.securityRevision !== target.revision.securityRevision ||
        captured.revision.subjectId !== target.revision.subjectId
      )
        return yield* TotpRejected.make({});

      const revision = yield* authority
        .capture(record.subjectId, [record.credentialId])
        .pipe(Effect.mapError(mapFailure));

      if (
        revision.securityRevision !== target.revision.securityRevision ||
        !revision.credentials.some(
          (item) => item.credentialId === record.credentialId && item.revision === record.revision,
        )
      )
        return yield* TotpRejected.make({});

      return AuthenticationEvidence.make({
        revision,
        flowId: target.flowId,
        bindingDigest: target.bindingDigest,
        proofs: [
          {
            method,
            credentialId: record.credentialId,
            factors: ["possession"],
            userVerified: false,
            phishingResistant: false,
            verifiedAt: yield* DateTime.now,
          },
        ],
      });
    });

    const revealRecovery = (
      codes: readonly string[],
      commandId: string,
      now: number,
    ): AuthRevealCommand => ({
      kind: "recovery-codes",
      revealId: commandId,
      expiresAtMillis: now + policy.revealLifetimeMillis,
      payload: Redacted.make(codes),
    });

    return {
      beginEnrollment: Effect.fn("Totp.beginEnrollment")(function* (
        invocation: AuthInvocation,
        original: typeof BeginInput.Type,
      ): Effect.fn.Return<AuthOperationResult<typeof TotpEnrollmentStarted.Type>, TotpFailure> {
        const input = yield* decode(BeginInput, original),
          captured = yield* authenticated(invocation),
          authorization = yield* authorize(
            invocation,
            captured,
            "enroll",
            input,
            input.accountName,
          );

        const now = DateTime.toEpochMillis(yield* DateTime.now);

        const secret = generateSecret(),
          manualKey = base32(secret),
          enrollmentId = randomId(),
          revision = randomId(),
          credentialId = captured.record?.credentialId ?? randomId();

        const envelope = yield* encryptSecret(
          { moduleId, subjectId: captured.revision.subjectId, credentialId, revision },
          secret,
        ).pipe(Effect.ensuring(Effect.sync(() => secret.fill(0))));

        const expiresAtMillis = now + policy.enrollmentLifetimeMillis;

        yield* commit(
          captured,
          input.commandId,
          {
            _tag: "Enroll",
            record: {
              ...(captured.record ?? {
                moduleId,
                subjectId: captured.revision.subjectId,
                credentialId,
                revision,
                version: randomId(),
                secret: null,
                recoveryDigests: [],
                acceptedStep: -1,
                attemptWindow: now,
                failedAttempts: 0,
              }),
              pending: {
                revision,
                enrollmentId,
                secret: envelope,
                expiresAtMillis,
                failedAttempts: 0,
              },
            },
          },
          authorization,
        );

        return {
          value: { enrollmentId, expiresAtMillis },
          credentialCommands: [],
          revealCommands: [
            {
              kind: "totp-enrollment",
              revealId: enrollmentId,
              expiresAtMillis: Math.min(expiresAtMillis, now + policy.revealLifetimeMillis),
              payload: Redacted.make({
                manualKey,
                uri: `otpauth://totp/${encodeURIComponent(policy.issuer)}:${encodeURIComponent(input.accountName)}?secret=${manualKey}&issuer=${encodeURIComponent(policy.issuer)}&algorithm=SHA1&digits=6&period=30`,
              }),
            },
          ],
        };
      }),
      confirmEnrollment: Effect.fn("Totp.confirmEnrollment")(function* (
        invocation: AuthInvocation,
        original: typeof ConfirmInput.Type,
      ): Effect.fn.Return<AuthOperationResult<typeof TotpManagementResult.Type>, TotpFailure> {
        const input = yield* decode(ConfirmInput, original),
          captured = yield* authenticated(invocation),
          authorization = yield* authorize(
            invocation,
            captured,
            "confirm",
            input,
            input.enrollmentId,
          ),
          codes = newRecoveryCodes(moduleId, captured.revision.subjectId),
          now = DateTime.toEpochMillis(yield* DateTime.now);

        yield* commit(
          captured,
          input.commandId,
          {
            _tag: "Confirm",
            enrollmentId: input.enrollmentId,
            matchedStep: yield* matched(captured, Redacted.value(input.code), true),
            recoveryDigests: codes.digests,
          },
          authorization,
        );

        return {
          value: { enabled: true, invalidation },
          credentialCommands: [],
          revealCommands: [revealRecovery(codes.codes, input.commandId, now)],
        };
      }),
      disable: Effect.fn("Totp.disable")(function* (
        invocation: AuthInvocation,
        original: typeof ManageInput.Type,
      ) {
        const input = yield* decode(ManageInput, original),
          captured = yield* authenticated(invocation),
          authorization = yield* authorize(invocation, captured, "disable", input, "");

        yield* commit(captured, input.commandId, { _tag: "Disable" }, authorization);

        return { enabled: false, invalidation };
      }),
      regenerateRecoveryCodes: Effect.fn("Totp.regenerateRecoveryCodes")(function* (
        invocation: AuthInvocation,
        original: typeof ManageInput.Type,
      ): Effect.fn.Return<AuthOperationResult<typeof TotpManagementResult.Type>, TotpFailure> {
        const input = yield* decode(ManageInput, original),
          captured = yield* authenticated(invocation),
          authorization = yield* authorize(invocation, captured, "regenerate", input, ""),
          codes = newRecoveryCodes(moduleId, captured.revision.subjectId),
          now = DateTime.toEpochMillis(yield* DateTime.now);

        yield* commit(
          captured,
          input.commandId,
          { _tag: "Regenerate", recoveryDigests: codes.digests },
          authorization,
        );

        return {
          value: { enabled: true, invalidation },
          credentialCommands: [],
          revealCommands: [revealRecovery(codes.codes, input.commandId, now)],
        };
      }),
      verifyPending: Effect.fn("Totp.verifyPending")(function* (
        invocation: AuthInvocation,
        original: typeof VerifyInput.Type,
      ) {
        yield* noAmbient;
        const input = yield* decode(VerifyInput, original);

        if (invocation._tag !== "Guest") return yield* TotpRejected.make({});

        const target = yield* completion
            .pendingContext(input.pendingCredential)
            .pipe(Effect.mapError(mapFailure)),
          captured = yield* snapshot(target.revision.subjectId),
          evidence = yield* evidenceFor(captured, target, "totp");

        yield* commit(captured, randomId(), {
          _tag: "Verify",
          matchedStep: yield* matched(captured, Redacted.value(input.code)),
        }).pipe(
          Effect.catchTag("TotpRejected", () =>
            completion
              .rejectPendingCredential(input.pendingCredential)
              .pipe(
                Effect.mapError(mapFailure),
                Effect.flatMap(read),
                Effect.andThen(TotpRejected.make({})),
              ),
          ),
        );

        return yield* completion
          .preparePending({ credential: input.pendingCredential, additional: evidence })
          .pipe(Effect.mapError(mapFailure), Effect.flatMap(read));
      }),
      verifyStepUp: Effect.fn("Totp.verifyStepUp")(function* (
        invocation: AuthInvocation,
        original: typeof StepUpInput.Type,
      ) {
        yield* noAmbient;
        const input = yield* decode(StepUpInput, original);

        if (invocation._tag !== "Authenticated") return yield* TotpRejected.make({});

        const target = yield* stepUp
          .context(input.stepUpCredential)
          .pipe(Effect.mapError(mapFailure));

        if (target.revision.subjectId !== invocation.subjectId) return yield* TotpRejected.make({});

        const captured = yield* snapshot(invocation.subjectId),
          evidence = yield* evidenceFor(captured, target, "totp");

        yield* commit(captured, randomId(), {
          _tag: "Verify",
          matchedStep: yield* matched(captured, Redacted.value(input.code)),
        }).pipe(
          Effect.catchTag("TotpRejected", () =>
            stepUp
              .rejectCredential(input.stepUpCredential)
              .pipe(
                Effect.mapError(mapFailure),
                Effect.flatMap(read),
                Effect.andThen(TotpRejected.make({})),
              ),
          ),
        );

        return yield* stepUp
          .prepareComplete({
            sourceCredential: input.sourceCredential,
            stepUpCredential: input.stepUpCredential,
            additional: evidence,
          })
          .pipe(Effect.mapError(mapFailure), Effect.flatMap(read));
      }),
      recoverPending: Effect.fn("Totp.recoverPending")(function* (
        invocation: AuthInvocation,
        original: typeof RecoveryInput.Type,
      ) {
        yield* noAmbient;
        const input = yield* decode(RecoveryInput, original);

        if (invocation._tag !== "Guest" || !policy.allowRecoveryCodeForPending)
          return yield* TotpRejected.make({});

        const target = yield* completion
            .pendingContext(input.pendingCredential)
            .pipe(Effect.mapError(mapFailure)),
          captured = yield* snapshot(target.revision.subjectId),
          evidence = yield* evidenceFor(captured, target, "recovery-code");

        yield* commit(captured, randomId(), {
          _tag: "Recovery",
          digest: recoveryDigest(moduleId, target.revision.subjectId, Redacted.value(input.code)),
          reset: false,
        }).pipe(
          Effect.catchTag("TotpRejected", () =>
            completion
              .rejectPendingCredential(input.pendingCredential)
              .pipe(
                Effect.mapError(mapFailure),
                Effect.flatMap(read),
                Effect.andThen(TotpRejected.make({})),
              ),
          ),
        );

        return yield* completion
          .preparePending({ credential: input.pendingCredential, additional: evidence })
          .pipe(Effect.mapError(mapFailure), Effect.flatMap(read));
      }),
      recoverLostFactor: Effect.fn("Totp.recoverLostFactor")(function* (
        invocation: AuthInvocation,
        original: typeof RecoveryInput.Type,
      ): Effect.fn.Return<AuthOperationResult<typeof TotpRecoveryReset.Type>, TotpFailure> {
        yield* noAmbient;
        const input = yield* decode(RecoveryInput, original);

        if (invocation._tag !== "Guest" || policy.lostFactorRecovery !== "reset-with-recovery-code")
          return yield* TotpRejected.make({});

        const target = yield* completion
            .pendingContext(input.pendingCredential)
            .pipe(Effect.mapError(mapFailure)),
          captured = yield* snapshot(target.revision.subjectId);

        yield* evidenceFor(captured, target, "recovery-code");
        yield* commit(captured, randomId(), {
          _tag: "Recovery",
          digest: recoveryDigest(moduleId, target.revision.subjectId, Redacted.value(input.code)),
          reset: true,
          pending: target,
        }).pipe(
          Effect.catchTag("TotpRejected", () =>
            completion
              .rejectPendingCredential(input.pendingCredential)
              .pipe(
                Effect.mapError(mapFailure),
                Effect.flatMap(read),
                Effect.andThen(TotpRejected.make({})),
              ),
          ),
        );

        return {
          value: { outcome: "reauthentication-required", invalidation },
          credentialCommands: [
            { _tag: "Clear", slot: "pending-proof" },
            { _tag: "Clear", slot: "session" },
          ],
        };
      }),
    };
  });

  const Totp = Context.Service<
    { readonly moduleId: Id; readonly kind: "totp" },
    Effect.Success<typeof make>
  >(`effect-auth/Totp/${moduleId.length}:${moduleId}`);

  const layer = Layer.effect(Totp, make);

  const {
    Begin,
    Confirm,
    Disable,
    Regenerate,
    VerifyPending,
    VerifyStepUp,
    RecoverPending,
    RecoverLostFactor,
  } = makeTotpContract(moduleId, sessions).operations;

  const handlersLayer = Layer.mergeAll(
    Begin.credentialHandlerLayer((input, invocation) =>
      Effect.flatMap(Totp, (service) => service.beginEnrollment(invocation, input)),
    ),
    Confirm.credentialHandlerLayer((input, invocation) =>
      Effect.flatMap(Totp, (service) => service.confirmEnrollment(invocation, input)),
    ),
    Disable.handlerLayer((input, invocation) =>
      Effect.flatMap(Totp, (service) => service.disable(invocation, input)),
    ),
    Regenerate.credentialHandlerLayer((input, invocation) =>
      Effect.flatMap(Totp, (service) => service.regenerateRecoveryCodes(invocation, input)),
    ),
    VerifyPending.credentialHandlerLayer((input, invocation) =>
      Effect.flatMap(Totp, (service) => service.verifyPending(invocation, input)),
    ),
    VerifyStepUp.credentialHandlerLayer((input, invocation) =>
      Effect.flatMap(Totp, (service) => service.verifyStepUp(invocation, input)),
    ),
    RecoverPending.credentialHandlerLayer((input, invocation) =>
      Effect.flatMap(Totp, (service) => service.recoverPending(invocation, input)),
    ),
    RecoverLostFactor.credentialHandlerLayer((input, invocation) =>
      Effect.flatMap(Totp, (service) => service.recoverLostFactor(invocation, input)),
    ),
  );

  return Object.freeze({
    Totp,
    layer,
    handlersLayer,
    operations: {
      Begin,
      Confirm,
      Disable,
      Regenerate,
      VerifyPending,
      VerifyStepUp,
      RecoverPending,
      RecoverLostFactor,
    },
    group: operationGroup(
      Begin,
      Confirm,
      Disable,
      Regenerate,
      VerifyPending,
      VerifyStepUp,
      RecoverPending,
      RecoverLostFactor,
    ),
    strategy: makeAuthStrategy(
      {
        beginEnrollment: Begin.invoke,
        confirmEnrollment: Confirm.invoke,
        disable: Disable.invoke,
        regenerateRecoveryCodes: Regenerate.invoke,
        verifyPending: VerifyPending.invoke,
        verifyStepUp: VerifyStepUp.invoke,
        recoverPending: RecoverPending.invoke,
        recoverLostFactor: RecoverLostFactor.invoke,
      },
      handlersLayer.pipe(Layer.provide(layer)),
      { completion: true },
    ),
  });
};
