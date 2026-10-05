import { Passkey, Password, Schema as AuthSchema, Sessions, WebCrypto } from "@yielded/auth";
import { layer as layerSimpleWebAuthnPasskeyProtocol } from "@yielded/auth-simplewebauthn/Server";
import { Crypto, Effect, Layer, Option, Schema } from "effect";
import { SqlClient } from "effect/sql";

import { AppAuth, sessionConfiguration } from "../../shared/account/auth";
import { Claims, minimumPasswordLength } from "../../shared/account/contract";
import { HashingLive } from "../../shared/account/hashing";
import { MigrationsLive } from "./migrations";
import { ActionPoliciesLive } from "./policy";
import { Persistence, storage } from "./schema";

// The application's versioned migrations own every table. Auth starts afterward.
export const DatabaseReady = MigrationsLive.pipe(
  Layer.provideMerge(Persistence.Config.layer(storage)),
);

const ProvisioningLive = Layer.effect(
  Persistence.Provisioning,
  Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient;
    const crypto = yield* Crypto.Crypto;
    const active = sql.onDialectOrElse({ pg: () => true, orElse: () => 1 });

    return {
      password: Effect.fn("Customers.create")(
        function* ({ registration }) {
          const id = yield* crypto.randomUUIDv4;
          const revision = yield* crypto.randomUUIDv4;

          // The same SqlClient joins AuthPersistence's registration transaction.
          yield* sql`insert into customers (customer_key, enabled, auth_revision, display_name)
            values (${id}, ${active}, ${revision}, ${registration.displayName})`;

          return yield* Schema.decodeUnknownEffect(AuthSchema.SubjectId)(id);
        },
        Effect.mapError(() => Password.PasswordUnavailable.make({})),
      ),
    };
  }),
).pipe(Layer.provide(WebCrypto.layerWebCrypto));

const ClaimsLive = Layer.effect(
  AppAuth.strategies.password.SessionClaims,
  Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient;
    const active = sql.onDialectOrElse({ pg: () => true, orElse: () => 1 });

    return {
      resolve: Effect.fn("Customers.claims")(
        function* ({ subjectId, credential }) {
          const rows = yield* sql`select display_name as "displayName" from customers
            where customer_key = ${subjectId} and enabled = ${active}`;

          if (rows.length !== 1) return yield* Password.PasswordUnavailable.make({});

          return yield* Schema.decodeUnknownEffect(Claims)({
            displayName: rows[0].displayName,
            email: credential.identifier.value,
            emailVerified: credential.identifierVerifiedAtMillis !== undefined,
          });
        },
        Effect.mapError(() => Password.PasswordUnavailable.make({})),
      ),
    };
  }),
);

const PasskeyClaimsLive = Layer.effect(
  AppAuth.strategies.passkey.SessionClaims,
  Effect.gen(function* () {
    const passwords = yield* Password.PasswordPersistence;
    const claims = yield* AppAuth.strategies.password.SessionClaims;

    return {
      resolve: Effect.fn("Customers.passkeyClaims")(
        function* ({ subjectId, credential }) {
          const current = yield* passwords.readForSubject({
            moduleId: AppAuth.strategies.password.persistence.moduleId,
            subjectId,
          });

          if (
            Option.isNone(current) ||
            current.value.revision.securityRevision !== credential.revision.securityRevision
          )
            return yield* Passkey.PasskeyUnavailable.make({});

          return yield* claims.resolve({
            subjectId: current.value.revision.subjectId,
            credential: current.value,
          });
        },
        Effect.mapError(() => Passkey.PasskeyUnavailable.make({})),
      ),
    };
  }),
).pipe(Layer.provide(ClaimsLive));

// Read current application claims without changing the session's authentication or expiry.
const SessionClaimsLive = Layer.effect(
  AppAuth.sessions.StatefulSessionPersistence,
  Effect.gen(function* () {
    const sessions = yield* AppAuth.sessions.StatefulSessionPersistence;
    const passwords = yield* Password.PasswordPersistence;
    const claims = yield* AppAuth.strategies.password.SessionClaims;

    return {
      ...sessions,
      verify: Effect.fn("Customers.sessionClaims")(
        function* (input) {
          const session = yield* sessions.verify(input);

          const current = yield* passwords.readForSubject({
            moduleId: AppAuth.strategies.password.persistence.moduleId,
            subjectId: session.subjectId,
          });

          if (
            Option.isNone(current) ||
            current.value.revision.subjectId !== session.subjectId ||
            current.value.revision.securityRevision !== session.securityRevision
          )
            return yield* Sessions.SessionInvalid.make({});

          return {
            ...session,
            claims: yield* claims.resolve({
              subjectId: current.value.revision.subjectId,
              credential: current.value,
            }),
          };
        },
        Effect.mapError((error) =>
          Schema.is(Sessions.SessionInvalid)(error) ? error : Sessions.SessionUnavailable.make({}),
        ),
      ),
    };
  }),
).pipe(
  Layer.provide(ClaimsLive),
  Layer.provideMerge(Persistence.layer.pipe(Layer.provide(ProvisioningLive))),
);

const ServicesLive = Layer.mergeAll(ClaimsLive, PasskeyClaimsLive, ActionPoliciesLive).pipe(
  Layer.provideMerge(SessionClaimsLive),
);

export const NativeSessionLive = AppAuth.sessions
  .layer(sessionConfiguration.policy(AppAuth.sessions.moduleId))
  .pipe(Layer.provideMerge(ServicesLive), Layer.provideMerge(DatabaseReady));

// The host supplies SQL, delivery, proof keys, and compromised-password screening.
export const AuthLive = AppAuth.layer.pipe(
  Layer.provide(
    Password.NewPasswordCheck.layer({
      ...Password.defaultPasswordPolicy,
      minimumCodePoints: minimumPasswordLength,
    }),
  ),
  Layer.provide(layerSimpleWebAuthnPasskeyProtocol),
  Layer.provide(ServicesLive),
  Layer.provideMerge(DatabaseReady),
  Layer.provideMerge(HashingLive),
);
