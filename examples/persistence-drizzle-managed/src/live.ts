import { Passkey, Password, Sessions } from "@yielded/auth";
import { layer as layerSimpleWebAuthnPasskeyProtocol } from "@yielded/auth-simplewebauthn/Server";
import { and, eq, getTableColumns } from "drizzle-orm";
import * as Drizzle from "drizzle-orm/effect-sqlite-bun";
import { Crypto, Effect, Layer, Option, Schema } from "effect";

import { AppAuth } from "../../shared/account/auth";
import { Claims, minimumPasswordLength } from "../../shared/account/contract";
import { HashingLive } from "../../shared/account/hashing";
import { CryptoLive } from "../../shared/crypto";
import { MigrationsLive } from "./migrations";
import { ActionPoliciesLive } from "./policy";
import { authSchema, customers, Persistence, storage } from "./schema";

// Drizzle applies the generated customer and auth migrations before auth starts.
export const DatabaseReady = MigrationsLive.pipe(
  Layer.provideMerge(Persistence.Config.layer(storage)),
);

const ProvisioningLive = Layer.effect(
  Persistence.Provisioning,
  Effect.gen(function* () {
    const crypto = yield* Crypto.Crypto;

    return {
      password: {
        values: Effect.fn("Customers.values")(
          function* ({ registration }) {
            const id = yield* crypto.randomUUIDv4();
            const revision = yield* crypto.randomUUIDv4();

            return {
              id,
              enabled: true,
              securityRevision: revision,
              displayName: registration.displayName,
            };
          },
          Effect.mapError(() => Password.PasswordUnavailable.make({})),
        ),
      },
    };
  }),
);

const ClaimsLive = Layer.effect(
  AppAuth.strategies.password.SessionClaims,
  Effect.gen(function* () {
    const database = yield* Drizzle.makeWithDefaults({});

    return {
      resolve: Effect.fn("Customers.claims")(
        function* ({ subjectId, credential }) {
          const rows = yield* database.select().from(customers).where(eq(customers.id, subjectId));

          if (rows.length !== 1 || !rows[0].enabled)
            return yield* Password.PasswordUnavailable.make({});

          return yield* Schema.decodeEffect(Claims)({
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
    const database = yield* Drizzle.makeWithDefaults({});
    const identifiers = authSchema.identifiers;
    const passwords = authSchema.passwords;

    const i = getTableColumns(identifiers),
      p = getTableColumns(passwords);

    return {
      ...sessions,
      verify: Effect.fn("Customers.sessionClaims")(
        function* (input) {
          const session = yield* sessions.verify(input);

          // Claims need the current account and identifier in one snapshot.
          const rows = yield* database
            .select({
              displayName: customers.displayName,
              email: i.value,
              verifiedAt: i.verifiedAt,
            })
            .from(customers)
            .innerJoin(identifiers, and(eq(i.subjectId, customers.id), eq(i.active, true)))
            .innerJoin(
              passwords,
              and(
                eq(p.subjectId, customers.id),
                eq(p.moduleId, AppAuth.strategies.password.persistence.moduleId),
              ),
            )
            .where(
              and(
                eq(customers.id, session.subjectId),
                eq(customers.enabled, true),
                eq(customers.securityRevision, session.securityRevision),
              ),
            )
            .limit(1);

          if (rows.length !== 1) return yield* Sessions.SessionInvalid.make({});

          return {
            ...session,
            claims: yield* Schema.decodeUnknownEffect(Claims)({
              displayName: rows[0].displayName,
              email: rows[0].email,
              emailVerified: rows[0].verifiedAt !== null,
            }),
          };
        },
        Effect.mapError((error) =>
          Schema.is(Sessions.SessionInvalid)(error) ? error : Sessions.SessionUnavailable.make({}),
        ),
      ),
    };
  }),
).pipe(Layer.provideMerge(Persistence.layer.pipe(Layer.provide(ProvisioningLive))));

const ServicesLive = Layer.mergeAll(ClaimsLive, PasskeyClaimsLive, ActionPoliciesLive).pipe(
  Layer.provideMerge(SessionClaimsLive),
);

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
  Layer.provide(
    Passkey.PasskeyConfig.layer({
      id: "localhost",
      name: "Yielded Auth",
      origins: ["http://localhost:4181"],
      developmentLocalhost: true,
    }),
  ),
  Layer.provide(CryptoLive),
);
