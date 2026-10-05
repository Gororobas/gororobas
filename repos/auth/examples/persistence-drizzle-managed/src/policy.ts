import { Auth, Email, Hooks, Passkey, Password, Sessions, WebCrypto } from "@yielded/auth";
import { and, eq, getTableColumns } from "drizzle-orm";
import * as Drizzle from "drizzle-orm/effect-sqlite-bun";
import { DateTime, Effect, Layer, Option, Schema } from "effect";

import {
  AppAuth,
  recoveryRequirement,
  requirement,
  sessionConfiguration,
  sessionRequirement,
} from "../../shared/account/auth";
import { authSchema } from "./schema";

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
          const source = yield* sessions.inspect(token);
          const original = source.provenance.evidence;

          const confirmsRegisteredAddress =
            challenge.action === "verify-address" &&
            challenge.targetIdentifierRevision !== undefined &&
            challenge.target.value === source.session.claims.email;

          if (
            (challenge.action === "verify-address" && !confirmsRegisteredAddress) ||
            source.session.sessionId !== invocation.sessionId ||
            source.session.subjectId !== invocation.subjectId ||
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

const RecoveryCredential = Schema.Struct({
  credentialId: Schema.NonEmptyString,
  credentialRevision: Sessions.SecurityRevision,
});

const PasswordActions = Layer.effect(
  Password.PasswordActionEvidence,
  Effect.gen(function* () {
    const passwords = yield* Password.PasswordPersistence;
    const authority = yield* Sessions.AuthenticationAuthority;
    const db = yield* Drizzle.makeWithDefaults({});
    const emails = authSchema.emailCredentials;
    const columns = getTableColumns(emails);

    return Password.PasswordActionEvidence.of({
      verify: Effect.fn("Customers.authorizePasswordChange")(
        function* ({ challenge, currentPasswordEvidence, recovery }) {
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
          if (
            challenge.action !== "reset-password" ||
            recovery === undefined ||
            recovery.binding._tag !== "Subject" ||
            recovery.moduleId !== `${AppAuth.strategies.password.persistence.moduleId}/reset` ||
            recovery.binding.revision.subjectId !== challenge.revision.subjectId ||
            !(yield* passwords.checkReset(recovery))
          )
            return yield* Password.PasswordActionRequired.make({});

          // This app's single-factor recovery policy requires its independently verified email credential.
          const rows = yield* db
            .select()
            .from(emails)
            .where(
              and(
                eq(columns.moduleId, AppAuth.strategies.email.persistence.moduleId),
                eq(columns.subjectId, challenge.revision.subjectId),
                eq(columns.identifierNamespace, recovery.binding.identifier.namespace),
                eq(columns.identifierValue, recovery.binding.identifier.value),
                eq(columns.active, true),
              ),
            );

          if (rows.length !== 1) return yield* Password.PasswordActionRequired.make({});
          const email = yield* Schema.decodeUnknownEffect(RecoveryCredential)(rows[0]);

          const revision = yield* authority.capture(challenge.revision.subjectId, [
            ...challenge.revision.credentials.map((item) => item.credentialId),
            email.credentialId,
          ]);

          if (revision.securityRevision !== challenge.revision.securityRevision)
            return yield* Password.PasswordActionRequired.make({});

          return {
            evidence: {
              revision,
              flowId: Sessions.AuthenticationFlowId.make(challenge.commandId),
              bindingDigest: challenge.bindingDigest,
              proofs: [
                {
                  method: "email-recovery",
                  credentialId: email.credentialId,
                  factors: ["possession" as const],
                  userVerified: false,
                  phishingResistant: false,
                  verifiedAt: DateTime.makeUnsafe(recovery.nowMillis),
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
);

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
          const source = yield* sessions.inspect(token);
          const original = source.provenance.evidence;

          if (
            source.session.sessionId !== invocation.sessionId ||
            source.session.subjectId !== invocation.subjectId ||
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
