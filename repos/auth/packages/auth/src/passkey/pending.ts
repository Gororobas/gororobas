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

export const makePasskeyPending = <
  const Id extends string,
  const SessionId extends string,
  Claims extends Schema.Codec<unknown, unknown, unknown, unknown>,
>(
  moduleId: Id,
  source: Effect.Effect<PasskeyMethodPolicy, PasskeyConfigurationError, PasskeyConfig>,
  sessions: ReturnType<typeof makeSessionModule<SessionId, Claims>>,
) => {
  const ceremony = makePasskeyCeremony(moduleId, source, "pending");
  const BeginInput = Schema.Struct({ ...PasskeyBegin.fields, pendingCredential: credential });
  const CompleteInput = Schema.Struct({ ...PasskeyComplete.fields, pendingCredential: credential });

  const Pending = Context.Service<
    {
      readonly moduleId: Id;
      readonly kind: "passkey-pending";
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
      ) => Effect.Effect<
        AuthOperationResult<typeof sessions.CompletionResult.Type>,
        PasskeyFailure
      >;
    }
  >(`effect-auth/PasskeyPending/${moduleId.length}:${moduleId}`);

  const layer = Layer.effect(
    Pending,
    Effect.gen(function* () {
      const runtime = yield* ceremony.make,
        completion = yield* sessions.AuthenticationCompletion;

      const services = yield* Effect.context<
        PasskeyCredentials | PasskeyEnrollmentContext | AuthenticationAuthority
      >();

      const target = Effect.fn("PasskeyPending.target")(function* (token: typeof credential.Type) {
        const context = yield* completion
          .pendingContext(token)
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

        return yield* snapshotPasskey(PasskeyTarget, {
          ...context,
          moduleId: sessions.moduleId,
          kind: "login-pending",
          commandId: context.flowId,
        });
      }, passkeyUnexpected);

      return Pending.of({
        begin: Effect.fn("PasskeyPending.begin")(function* (invocation, input) {
          input = yield* snapshotPasskey(Schema.toType(BeginInput), input);
          yield* passkeyNoAmbient();
          if (invocation._tag !== "Guest") return yield* PasskeyRejected.make({});

          const fixed = yield* target(input.pendingCredential),
            captured = yield* runtime
              .exclusions(input.profileId, fixed.revision.subjectId)
              .pipe(Effect.provide(services));

          return yield* runtime.beginAuthentication(
            input,
            { _tag: "Pending", target: fixed },
            captured.credentials,
          );
        }, passkeyUnexpected),
        complete: Effect.fn("PasskeyPending.complete")(function* (invocation, input) {
          input = yield* snapshotPasskey(Schema.toType(CompleteInput), input);
          yield* passkeyNoAmbient();
          if (invocation._tag !== "Guest") return yield* PasskeyRejected.make({});
          const fixed = yield* target(input.pendingCredential);

          const verified = yield* runtime
            .authentication(input, { _tag: "Pending", target: fixed })
            .pipe(
              Effect.provide(services),
              Effect.catchTag("PasskeyRejected", () =>
                Effect.gen(function* () {
                  yield* readPasskeyCommit(
                    yield* completion
                      .rejectPendingCredential(input.pendingCredential)
                      .pipe(Effect.mapError(() => PasskeyUnavailable.make({}))),
                  );

                  return yield* PasskeyRejected.make({});
                }),
              ),
            );

          const result = yield* readPasskeyCommit(
            yield* completion
              .preparePending({
                credential: input.pendingCredential,
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

  const Begin = makeOperation(`${moduleId}/passkey/pending/begin`, {
    payload: BeginInput,
    success: PasskeyAuthenticationStarted,
    error: PasskeyFailure,
    exposure: "public",
    access: "any",
    replay: "single-use",
    credentials: true,
  });

  const Complete = makeOperation(`${moduleId}/passkey/pending/complete`, {
    payload: CompleteInput,
    success: sessions.CompletionResult,
    error: PasskeyFailure,
    exposure: "public",
    access: "any",
    replay: "single-use",
    credentials: true,
  });

  return Object.freeze({
    Pending,
    binding: ceremony.binding,
    layer,
    operations: Object.freeze({ Begin, Complete }),
    group: operationGroup(Begin, Complete),
    handlersLayer: Layer.mergeAll(
      Begin.credentialHandlerLayer((input, invocation) =>
        Effect.flatMap(Pending, (service) => service.begin(invocation, input)),
      ),
      Complete.credentialHandlerLayer((input, invocation) =>
        Effect.flatMap(Pending, (service) => service.complete(invocation, input)),
      ),
    ),
  });
};
