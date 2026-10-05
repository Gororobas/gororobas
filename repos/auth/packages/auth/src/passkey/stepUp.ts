import { Context, Effect, Layer, Schema, type Types } from "effect";

import type { AuthInvocation } from "../operations/context";
import type { AuthOperationResult } from "../operations/credentials";
import { makeOperation, operationGroup } from "../operations/operation";
import type { AuthenticationAuthority } from "../sessions/AuthenticationAuthority";
import type { makeSessionModule } from "../sessions/module";
import {
  passkeyUnexpected,
  makePasskeyCeremony,
  passkeyNoAmbient,
  readPasskeyCommit,
} from "./actions";
import type { PasskeyConfigurationError } from "./errors";
import {
  PasskeyFailure,
  PasskeyMethodUnsupported,
  PasskeyRejected,
  PasskeyUnavailable,
} from "./errors";
import {
  PasskeyAuthenticationStarted,
  PasskeyBegin,
  PasskeyComplete,
  PasskeyTarget,
} from "./models";
import type { PasskeyConfig } from "./PasskeyConfig";
import type { PasskeyCredentials } from "./PasskeyCredentials";
import type { PasskeyEnrollmentContext } from "./PasskeyEnrollmentContext";
import type { PasskeyMethodPolicy } from "./policy";
import { snapshotPasskey } from "./snapshot";
const credential = Schema.RedactedFromValue(Schema.NonEmptyString.check(Schema.isMaxLength(16384)));

export const makePasskeyStepUp = <
  const Id extends string,
  const SessionId extends string,
  Claims extends Schema.Codec<unknown, unknown, unknown, unknown>,
>(
  moduleId: Id,
  source: Effect.Effect<PasskeyMethodPolicy, PasskeyConfigurationError, PasskeyConfig>,
  sessions: ReturnType<typeof makeSessionModule<SessionId, Claims>>,
) => {
  const ceremony = makePasskeyCeremony(moduleId, source, "step-up");
  const BeginInput = Schema.Struct({ ...PasskeyBegin.fields, stepUpCredential: credential });

  const CompleteInput = Schema.Struct({
    ...PasskeyComplete.fields,
    stepUpCredential: credential,
    sourceCredential: credential,
  });

  const StepUp = Context.Service<
    {
      readonly moduleId: Id;
      readonly kind: "passkey-step-up";
      readonly claims: Types.Invariant<Claims["Type"]>;
    },
    {
      readonly begin: (
        invocation: AuthInvocation,
        input: typeof BeginInput.Type,
      ) => Effect.Effect<AuthOperationResult<PasskeyAuthenticationStarted>, PasskeyFailure>;
      readonly complete: (
        invocation: AuthInvocation,
        input: typeof CompleteInput.Type,
      ) => Effect.Effect<AuthOperationResult<typeof sessions.Session.Type>, PasskeyFailure>;
    }
  >(`effect-auth/PasskeyStepUp/${moduleId.length}:${moduleId}`);

  const layer = Layer.effect(
    StepUp,
    Effect.gen(function* () {
      const runtime = yield* ceremony.make,
        stepUp = yield* sessions.SessionStepUp;

      const services = yield* Effect.context<
        PasskeyCredentials | PasskeyEnrollmentContext | AuthenticationAuthority
      >();

      const target = Effect.fn("PasskeyStepUp.target")(function* (
        invocation: AuthInvocation,
        token: typeof credential.Type,
      ) {
        if (invocation._tag !== "Authenticated") return yield* PasskeyRejected.make({});

        const context = yield* stepUp
          .context(token)
          .pipe(
            Effect.mapError((error) =>
              error._tag === "HookDenied"
                ? error
                : error._tag === "SessionUnavailable"
                  ? PasskeyUnavailable.make({})
                  : error._tag === "SessionCapabilityUnsupported"
                    ? PasskeyMethodUnsupported.make({})
                    : PasskeyRejected.make({}),
            ),
          );

        if (context.revision.subjectId !== invocation.subjectId)
          return yield* PasskeyRejected.make({});

        return yield* snapshotPasskey(PasskeyTarget, {
          ...context,
          moduleId: sessions.moduleId,
          kind: "session-step-up",
          commandId: context.flowId,
        });
      }, passkeyUnexpected);

      return StepUp.of({
        begin: Effect.fn("PasskeyStepUp.begin")(function* (invocation, input) {
          input = yield* snapshotPasskey(Schema.toType(BeginInput), input);
          yield* passkeyNoAmbient();

          const fixed = yield* target(invocation, input.stepUpCredential),
            captured = yield* runtime
              .exclusions(input.profileId, fixed.revision.subjectId)
              .pipe(Effect.provide(services));

          return yield* runtime.beginAuthentication(
            input,
            { _tag: "StepUp", target: fixed },
            captured.credentials,
          );
        }, passkeyUnexpected),
        complete: Effect.fn("PasskeyStepUp.complete")(function* (invocation, input) {
          input = yield* snapshotPasskey(Schema.toType(CompleteInput), input);
          yield* passkeyNoAmbient();
          const fixed = yield* target(invocation, input.stepUpCredential);

          const verified = yield* runtime
            .authentication(input, { _tag: "StepUp", target: fixed })
            .pipe(
              Effect.provide(services),
              Effect.catchTag("PasskeyRejected", () =>
                Effect.gen(function* () {
                  yield* readPasskeyCommit(
                    yield* stepUp
                      .rejectCredential(input.stepUpCredential)
                      .pipe(Effect.mapError(() => PasskeyUnavailable.make({}))),
                  );

                  return yield* PasskeyRejected.make({});
                }),
              ),
            );

          const result = yield* readPasskeyCommit(
            yield* stepUp
              .prepareComplete({
                sourceCredential: input.sourceCredential,
                stepUpCredential: input.stepUpCredential,
                additional: verified.evidence,
              })
              .pipe(
                Effect.mapError((error) =>
                  error._tag === "HookDenied"
                    ? error
                    : error._tag === "SessionUnavailable"
                      ? PasskeyUnavailable.make({})
                      : error._tag === "SessionCapabilityUnsupported"
                        ? PasskeyMethodUnsupported.make({})
                        : PasskeyRejected.make({}),
                ),
              ),
          );

          return {
            value: result.value,
            credentialCommands: [...verified.credentialCommands, ...result.credentialCommands],
          };
        }, passkeyUnexpected),
      });
    }),
  );

  const Begin = makeOperation(`${moduleId}/passkey/step-up/begin`, {
    payload: BeginInput,
    success: PasskeyAuthenticationStarted,
    error: PasskeyFailure,
    exposure: "public",
    access: "authenticated",
    replay: "single-use",
    credentials: true,
  });

  const Complete = makeOperation(`${moduleId}/passkey/step-up/complete`, {
    payload: CompleteInput,
    success: sessions.Session,
    error: PasskeyFailure,
    exposure: "public",
    access: "authenticated",
    replay: "single-use",
    credentials: true,
  });

  return Object.freeze({
    StepUp,
    binding: ceremony.binding,
    layer,
    operations: Object.freeze({ Begin, Complete }),
    group: operationGroup(Begin, Complete),
    handlersLayer: Layer.mergeAll(
      Begin.credentialHandlerLayer((input, invocation) =>
        Effect.flatMap(StepUp, (service) => service.begin(invocation, input)),
      ),
      Complete.credentialHandlerLayer((input, invocation) =>
        Effect.flatMap(StepUp, (service) => service.complete(invocation, input)),
      ),
    ),
  });
};
