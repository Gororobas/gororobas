import { Context, Effect, Layer, Schema, type Redacted } from "effect";

import { HookDenied } from "./hooks/models";
import type { AuthInvocation } from "./operations/context";
import type { AuthOperationResult } from "./operations/credentials";
import { makeOperation, operationGroup } from "./operations/operation";
import type { makePasskeyActions } from "./passkey/actions";
import { passkeyNoAmbient, passkeyUnexpected, readPasskeyCommit } from "./passkey/actions";
import { PasskeyFailure } from "./passkey/errors";
import {
  PasskeyAuthenticationStarted,
  PasskeyBegin,
  PasskeyComplete,
  PasskeyTarget,
} from "./passkey/models";
import { snapshotPasskey } from "./passkey/snapshot";
import { NewPasswordRejected, PasswordCheckUnavailable } from "./password/errors";
import {
  PasswordActionRequired,
  PasswordMethodUnsupported,
  PasswordRejected,
  PasswordUnavailable,
} from "./password/methods/errors";
import type {
  PasswordPreparedAuthorization,
  PasswordPreparedCompletionPlan,
} from "./password/methods/prepared";
import {
  PasswordPreparedCredential,
  type PasswordPreparedContext,
} from "./password/methods/preparedModels";
import { SessionInvalidationWindow } from "./sessions/invalidation";
import { AuthenticationFlowId } from "./sessions/models";

const PasswordFailure = Schema.Union([
  PasswordRejected,
  PasswordUnavailable,
  PasswordActionRequired,
  PasswordMethodUnsupported,
  NewPasswordRejected,
  PasswordCheckUnavailable,
  HookDenied,
]);

type PasswordFailure = typeof PasswordFailure.Type;
const Failure = Schema.Union([PasskeyFailure, PasswordFailure]);

type Failure = typeof Failure.Type;
interface Prepared<ResetId, CommitId> {
  readonly context: (
    invocation: AuthInvocation,
    credential: Redacted.Redacted<string>,
  ) => Effect.Effect<PasswordPreparedContext, PasswordFailure>;
  readonly resetContext: (
    invocation: AuthInvocation,
    input: {
      readonly intentCredential: Redacted.Redacted<string>;
      readonly continuationCredential: Redacted.Redacted<string>;
    },
  ) => Effect.Effect<PasswordPreparedContext, PasswordFailure, ResetId>;
  readonly planCompleteAuthorized: (
    invocation: AuthInvocation,
    input: { readonly intentCredential: Redacted.Redacted<string> },
    authorization: PasswordPreparedAuthorization,
  ) => Effect.Effect<PasswordPreparedCompletionPlan<CommitId>, PasswordFailure>;
  readonly planResetCompleteAuthorized: (
    invocation: AuthInvocation,
    input: {
      readonly intentCredential: Redacted.Redacted<string>;
      readonly continuationCredential: Redacted.Redacted<string>;
    },
    authorization: PasswordPreparedAuthorization,
  ) => Effect.Effect<PasswordPreparedCompletionPlan<CommitId>, PasswordFailure, ResetId>;
}

/** Separate assertion payloads; no change to ordinary password actionProof. Each
 * target capability is authenticated before factor claim; final target plans keep
 * their original proof/CAS/policy owner. Factor consumption is never refunded. */
export const makePasskeyPasswordActions = <
  const Id extends string,
  const PasskeyId extends string,
  PreparedId,
  ResetId,
  CommitId,
>(
  moduleId: Id,
  options: {
    readonly passkeys: ReturnType<typeof makePasskeyActions<PasskeyId>>;
    readonly prepared: {
      readonly PasswordPrepared: Context.Key<PreparedId, Prepared<ResetId, CommitId>>;
    };
  },
) => {
  const BeginInput = Schema.Struct({
    ...PasskeyBegin.fields,
    intentCredential: PasswordPreparedCredential,
  });

  const CompleteInput = Schema.Struct({
    ...PasskeyComplete.fields,
    intentCredential: PasswordPreparedCredential,
  });

  const continuation = Schema.RedactedFromValue(
    Schema.NonEmptyString.check(Schema.isMaxLength(4096)),
  );

  const ResetBeginInput = Schema.Struct({
    ...BeginInput.fields,
    continuationCredential: continuation,
  });

  const ResetCompleteInput = Schema.Struct({
    ...CompleteInput.fields,
    continuationCredential: continuation,
  });

  const Result = Schema.Struct({ invalidation: SessionInvalidationWindow });

  const target = (context: PasswordPreparedContext) =>
    snapshotPasskey(PasskeyTarget, {
      moduleId: context.challenge.moduleId,
      kind: `password/${context.action}`,
      commandId: context.challenge.commandId,
      flowId: AuthenticationFlowId.make(context.challenge.commandId),
      bindingDigest: context.challenge.bindingDigest,
      revision: context.challenge.revision,
      requirement: context.capturedRequirement,
      expiresAtMillis: context.expiresAtMillis,
    });

  const PasswordActions = Context.Service<
    { readonly moduleId: Id; readonly kind: "passkey-password-actions" },
    {
      readonly begin: (
        invocation: AuthInvocation,
        input: typeof BeginInput.Type,
      ) => Effect.Effect<AuthOperationResult<typeof PasskeyAuthenticationStarted.Type>, Failure>;
      readonly complete: (
        invocation: AuthInvocation,
        input: typeof CompleteInput.Type,
      ) => Effect.Effect<AuthOperationResult<typeof Result.Type>, Failure, CommitId>;
    }
  >(`effect-auth/PasskeyPasswordActions/${moduleId.length}:${moduleId}`);

  const ResetPasswordActions = Context.Service<
    { readonly moduleId: Id; readonly kind: "passkey-reset-password-actions" },
    {
      readonly begin: (
        invocation: AuthInvocation,
        input: typeof ResetBeginInput.Type,
      ) => Effect.Effect<AuthOperationResult<typeof PasskeyAuthenticationStarted.Type>, Failure>;
      readonly complete: (
        invocation: AuthInvocation,
        input: typeof ResetCompleteInput.Type,
      ) => Effect.Effect<AuthOperationResult<typeof Result.Type>, Failure, CommitId>;
    }
  >(`effect-auth/PasskeyResetPasswordActions/${moduleId.length}:${moduleId}`);

  const layer = Layer.effect(
    PasswordActions,
    Effect.gen(function* () {
      const actions = yield* options.passkeys.PasskeyActionAssertions,
        prepared = yield* options.prepared.PasswordPrepared;

      return PasswordActions.of({
        begin: Effect.fn("PasskeyPasswordActions.begin")(function* (invocation, input) {
          input = yield* snapshotPasskey(Schema.toType(BeginInput), input);
          yield* passkeyNoAmbient();
          const context = yield* prepared.context(invocation, input.intentCredential);

          if (context.action === "reset-password") return yield* PasswordRejected.make({});

          return yield* actions.begin(input, yield* target(context));
        }, passkeyUnexpected),
        complete: Effect.fn("PasskeyPasswordActions.complete")(function* (invocation, input) {
          input = yield* snapshotPasskey(Schema.toType(CompleteInput), input);
          yield* passkeyNoAmbient();
          const context = yield* prepared.context(invocation, input.intentCredential);

          if (context.action === "reset-password") return yield* PasswordRejected.make({});
          const factor = yield* actions.complete(input, yield* target(context));

          const plan = yield* prepared.planCompleteAuthorized(
            invocation,
            { intentCredential: input.intentCredential },
            { evidence: factor.evidence, requirement: context.capturedRequirement },
          );

          const result = yield* readPasskeyCommit(yield* plan.commit);

          if ("_tag" in result.value) return yield* PasswordRejected.make({});

          return {
            value: result.value,
            credentialCommands: [...factor.credentialCommands, ...result.credentialCommands],
          };
        }, passkeyUnexpected),
      });
    }),
  );

  const resetLayer = Layer.effect(
    ResetPasswordActions,
    Effect.gen(function* () {
      const actions = yield* options.passkeys.PasskeyActionAssertions,
        prepared = yield* options.prepared.PasswordPrepared,
        services = yield* Effect.context<ResetId>();

      return ResetPasswordActions.of({
        begin: Effect.fn("PasskeyResetPasswordActions.begin")(function* (invocation, input) {
          input = yield* snapshotPasskey(Schema.toType(ResetBeginInput), input);
          yield* passkeyNoAmbient();

          const context = yield* prepared
            .resetContext(invocation, input)
            .pipe(Effect.provide(services));

          return yield* actions.begin(input, yield* target(context));
        }, passkeyUnexpected),
        complete: Effect.fn("PasskeyResetPasswordActions.complete")(function* (invocation, input) {
          input = yield* snapshotPasskey(Schema.toType(ResetCompleteInput), input);
          yield* passkeyNoAmbient();

          const context = yield* prepared
            .resetContext(invocation, input)
            .pipe(Effect.provide(services));

          const factor = yield* actions.complete(input, yield* target(context));

          const plan = yield* prepared
            .planResetCompleteAuthorized(invocation, input, {
              evidence: factor.evidence,
              requirement: context.capturedRequirement,
            })
            .pipe(Effect.provide(services));

          const result = yield* readPasskeyCommit(yield* plan.commit);

          if ("_tag" in result.value) return yield* PasswordRejected.make({});

          return {
            value: result.value,
            credentialCommands: [...factor.credentialCommands, ...result.credentialCommands],
          };
        }, passkeyUnexpected),
      });
    }),
  );

  const Begin = makeOperation(`${moduleId}/passkey/password/begin`, {
    payload: BeginInput,
    success: PasskeyAuthenticationStarted,
    error: Failure,
    exposure: "public",
    access: "authenticated",
    replay: "single-use",
    credentials: true,
  });

  const Complete = makeOperation(`${moduleId}/passkey/password/complete`, {
    payload: CompleteInput,
    success: Result,
    error: Failure,
    exposure: "public",
    access: "authenticated",
    replay: "single-use",
    credentials: true,
  });

  const ResetBegin = makeOperation(`${moduleId}/passkey/password/reset/begin`, {
    payload: ResetBeginInput,
    success: PasskeyAuthenticationStarted,
    error: Failure,
    exposure: "public",
    access: "any",
    replay: "single-use",
    credentials: true,
  });

  const ResetComplete = makeOperation(`${moduleId}/passkey/password/reset/complete`, {
    payload: ResetCompleteInput,
    success: Result,
    error: Failure,
    exposure: "public",
    access: "any",
    replay: "single-use",
    credentials: true,
  });

  return Object.freeze({
    PasswordActions,
    layer,
    operations: Object.freeze({ Begin, Complete }),
    group: operationGroup(Begin, Complete),
    handlersLayer: Layer.mergeAll(
      Begin.credentialHandlerLayer((input, invocation) =>
        Effect.flatMap(PasswordActions, (service) => service.begin(invocation, input)),
      ),
      Complete.credentialHandlerLayer((input, invocation) =>
        Effect.flatMap(PasswordActions, (service) => service.complete(invocation, input)),
      ),
    ),
    reset: Object.freeze({
      PasswordActions: ResetPasswordActions,
      layer: resetLayer,
      operations: Object.freeze({ Begin: ResetBegin, Complete: ResetComplete }),
      group: operationGroup(ResetBegin, ResetComplete),
      handlersLayer: Layer.mergeAll(
        ResetBegin.credentialHandlerLayer((input, invocation) =>
          Effect.flatMap(ResetPasswordActions, (service) => service.begin(invocation, input)),
        ),
        ResetComplete.credentialHandlerLayer((input, invocation) =>
          Effect.flatMap(ResetPasswordActions, (service) => service.complete(invocation, input)),
        ),
      ),
    }),
  });
};
