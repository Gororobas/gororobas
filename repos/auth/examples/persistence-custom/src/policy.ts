import { Auth, Email, Hooks, Passkey, Password, Sessions, WebCrypto } from "@yielded/auth";
import { DateTime, Effect, Layer, Option, Schema } from "effect";

import {
  recoveryRequirement,
  requirement,
  sessionConfiguration,
  sessionRequirement,
} from "../../shared/account/auth";
import { authorizePasswordSession } from "../../shared/account/password-authorization";
import { AppAuth } from "./auth";
import { AccountStore } from "./store";

const SessionReader = AppAuth.sessions
  .statefulLayer(sessionConfiguration.policy(AppAuth.sessions.moduleId))
  .pipe(Layer.provide([WebCrypto.layerWebCrypto, Hooks.LifecycleHooks.empty]));

const EmailActions = Layer.effect(
  Email.EmailActionEvidence,
  Effect.gen(function* () {
    const sessions = yield* AppAuth.sessions.SessionStrategy;

    return Email.EmailActionEvidence.of({
      verify: Effect.fn("Customers.authorizeEmailVerification")(
        function* ({ invocation, challenge }) {
          const request = yield* Effect.serviceOption(Auth.AuthRequest);
          const token = Option.isSome(request) ? request.value.credentials.session : undefined;

          if (invocation._tag !== "Authenticated" || token === undefined)
            return yield* Email.EmailActionRequired.make({});

          const source = yield* AppAuth.sessions
            .inspectInvocation(invocation, token)
            .pipe(Effect.provideService(AppAuth.sessions.SessionStrategy, sessions));

          const original = source.inspection.provenance.evidence;

          const confirmsRegisteredAddress =
            challenge.action === "verify-address" &&
            challenge.targetIdentifierRevision !== undefined &&
            challenge.target.value === source.inspection.session.claims.email;

          if (
            (challenge.action === "verify-address" && !confirmsRegisteredAddress) ||
            source.inspection.session.sessionId !== invocation.sessionId ||
            source.inspection.session.subjectId !== invocation.subjectId ||
            original.revision.subjectId !== challenge.revision.subjectId ||
            original.revision.securityRevision !== challenge.revision.securityRevision ||
            original.revision.credentials.some(
              (item) =>
                !challenge.revision.credentials.some(
                  (current) =>
                    current.credentialId === item.credentialId &&
                    current.revision === item.revision,
                ),
            )
          )
            return yield* Email.EmailActionRequired.make({});

          // Preserve the original authentication time and factors, including for an older valid session.
          return {
            evidence: {
              ...original,
              revision: challenge.revision,
              flowId: Sessions.AuthenticationFlowId.make(challenge.commandId),
              bindingDigest: challenge.bindingDigest,
            },
            requirement: confirmsRegisteredAddress ? sessionRequirement : requirement,
          };
        },
        Effect.mapError((error) =>
          Schema.is(Email.EmailActionRequired)(error) ? error : Email.EmailUnavailable.make({}),
        ),
      ),
    });
  }),
).pipe(Layer.provide(SessionReader));

const PasswordActions = Layer.effect(
  Password.PasswordActionEvidence,
  Effect.gen(function* () {
    const sessions = yield* AppAuth.sessions.SessionStrategy;
    const store = yield* AccountStore;

    return Password.PasswordActionEvidence.of({
      verify: Effect.fn("Customers.authorizePasswordChange")(
        function* ({ invocation, challenge, currentPasswordEvidence, recovery }) {
          if (challenge.action === "change-password" && currentPasswordEvidence !== undefined) {
            return {
              evidence: {
                ...currentPasswordEvidence,
                flowId: Sessions.AuthenticationFlowId.make(challenge.commandId),
                bindingDigest: challenge.bindingDigest,
              },
              requirement,
            };
          }
          if (challenge.action === "change-password") {
            const request = yield* Effect.serviceOption(Auth.AuthRequest);
            const token = Option.isSome(request) ? request.value.credentials.session : undefined;

            if (invocation._tag !== "Authenticated" || token === undefined)
              return yield* Password.PasswordActionRequired.make({});

            const source = yield* AppAuth.sessions
              .inspectInvocation(invocation, token)
              .pipe(Effect.provideService(AppAuth.sessions.SessionStrategy, sessions));

            return yield* authorizePasswordSession(invocation, challenge, source);
          }
          if (
            challenge.action !== "reset-password" ||
            recovery === undefined ||
            recovery.binding._tag !== "Subject" ||
            recovery.moduleId !== `${AppAuth.strategies.password.persistence.moduleId}/reset` ||
            recovery.binding.revision.subjectId !== challenge.revision.subjectId
          )
            return yield* Password.PasswordActionRequired.make({});

          const verifiedAt = yield* DateTime.now;

          // The mutation owner redeems the candidate atomically; policy also requires a verified email credential.
          const email = yield* store.read((state) =>
            Effect.sync(
              () =>
                state.customers.find(
                  (account) =>
                    account.id === challenge.revision.subjectId &&
                    account.active &&
                    account.email === recovery.binding.identifier.value &&
                    account.verifiedAtMillis !== undefined,
                )?.emailCredential,
            ),
          );

          if (email === undefined) return yield* Password.PasswordActionRequired.make({});

          if (
            !challenge.revision.credentials.some(
              (item) => item.credentialId === email.id && item.revision === email.revision,
            )
          )
            return yield* Password.PasswordActionRequired.make({});

          return {
            evidence: {
              revision: challenge.revision,
              flowId: Sessions.AuthenticationFlowId.make(challenge.commandId),
              bindingDigest: challenge.bindingDigest,
              proofs: [
                {
                  method: "email-recovery",
                  credentialId: email.id,
                  factors: ["possession" as const],
                  userVerified: false,
                  phishingResistant: false,
                  verifiedAt,
                },
              ] as const,
            },
            requirement: recoveryRequirement,
          };
        },
        Effect.mapError((error) =>
          Schema.is(Password.PasswordActionRequired)(error)
            ? error
            : Password.PasswordUnavailable.make({}),
        ),
      ),
    });
  }),
).pipe(Layer.provide(SessionReader));

const PasskeyActions = Layer.effect(
  Passkey.PasskeyActionEvidence,
  Effect.gen(function* () {
    const sessions = yield* AppAuth.sessions.SessionStrategy;

    return Passkey.PasskeyActionEvidence.of({
      verify: Effect.fn("Customers.authorizePasskey")(
        function* ({ invocation, challenge }) {
          const request = yield* Effect.serviceOption(Auth.AuthRequest);
          const token = Option.isSome(request) ? request.value.credentials.session : undefined;

          if (invocation._tag !== "Authenticated" || token === undefined)
            return yield* Passkey.PasskeyActionRequired.make({});

          const source = yield* AppAuth.sessions
            .inspectInvocation(invocation, token)
            .pipe(Effect.provideService(AppAuth.sessions.SessionStrategy, sessions));

          const original = source.inspection.provenance.evidence;

          if (
            source.inspection.session.sessionId !== invocation.sessionId ||
            source.inspection.session.subjectId !== invocation.subjectId ||
            original.revision.subjectId !== challenge.revision.subjectId ||
            original.revision.securityRevision !== challenge.revision.securityRevision ||
            original.revision.credentials.some(
              (item) =>
                !challenge.revision.credentials.some(
                  (current) =>
                    current.credentialId === item.credentialId &&
                    current.revision === item.revision,
                ),
            )
          )
            return yield* Passkey.PasskeyActionRequired.make({});

          return {
            evidence: {
              ...original,
              revision: challenge.revision,
              flowId: Sessions.AuthenticationFlowId.make(challenge.flowId),
              bindingDigest: challenge.bindingDigest,
            },
            requirement,
          };
        },
        Effect.mapError((error) =>
          Schema.is(Passkey.PasskeyActionRequired)(error)
            ? error
            : Passkey.PasskeyUnavailable.make({}),
        ),
      ),
    });
  }),
).pipe(Layer.provide(SessionReader));

export const ActionPoliciesLive = Layer.mergeAll(EmailActions, PasswordActions, PasskeyActions);
