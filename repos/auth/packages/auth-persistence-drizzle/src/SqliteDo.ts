import { SqliteClient } from "@effect/sql-sqlite-do/SqliteClient";
import { NativeDatabase, PersistenceConfigurationError } from "@yielded/auth-persistence/Adapter";
import type { AnyRelations } from "drizzle-orm";
import { type EffectSQLiteDoDatabase, makeWithDefaults } from "drizzle-orm/effect-sqlite-do";
import type { AnySQLiteTable } from "drizzle-orm/sqlite-core";
import { Context, Effect, Layer } from "effect";

import { nativeDatabase } from "./drizzle/native-database";

/** The application-owned Drizzle database used to construct persistence services. */
export class Database extends Context.Service<Database, EffectSQLiteDoDatabase<AnyRelations>>()(
  "effect-auth/persistence-drizzle/SqliteDo/Database",
) {}

/** The SQL-client Layer must configure storage so Drizzle owns transactionSync. */
export const databaseLayer = Layer.effect(
  Database,
  Effect.gen(function* () {
    const client = yield* SqliteClient;
    const storage = client.config.storage;

    if (storage === undefined)
      return yield* PersistenceConfigurationError.make({
        reason:
          "SqliteDo requires a SQL client configured with storage for synchronous transactions",
      });

    return yield* makeWithDefaults({ storage });
  }),
);

import type {
  ExternalIdentityTables,
  IdentityTables,
  SubjectProvisioningTables,
} from "./drizzle/model";
import { makeSqliteEmailTarget, sqliteEmailConfiguration } from "./drizzle/sqlite-emails";
import {
  makeSqliteExternalIdentityServices,
  makeSqliteIdentityServices,
  makeSqliteSubjectProvisioningServices,
} from "./drizzle/sqlite-identity";
import { makeSqlitePasswordTarget, sqlitePasswordConfiguration } from "./drizzle/sqlite-passwords";
import { makeSqliteProofTarget, sqliteProofConfiguration } from "./drizzle/sqlite-proofs";
import { makeSqliteSessionTarget, sqliteSessionConfiguration } from "./drizzle/sqlite-sessions";

const sessionTarget = makeSqliteSessionTarget<Database, EffectSQLiteDoDatabase<AnyRelations>, true>(
  Database,
  sqliteSessionConfiguration("synchronous", Effect.void),
);

const proofTarget = makeSqliteProofTarget<Database, EffectSQLiteDoDatabase<AnyRelations>, true>(
  Database,
  sqliteProofConfiguration("synchronous", Effect.void),
);

const passwordTarget = makeSqlitePasswordTarget<
  Database,
  EffectSQLiteDoDatabase<AnyRelations>,
  true
>(Database, sqlitePasswordConfiguration("synchronous", Effect.void, Effect.void));

const emailTarget = makeSqliteEmailTarget<Database, EffectSQLiteDoDatabase<AnyRelations>, true>(
  Database,
  sqliteEmailConfiguration("synchronous", Effect.void, Effect.void),
);

/**
 * Email mutations must own their outer transactionSync. Arbitrary raw Drizzle
 * nesting is not detectable; owner bodies and mapping allocators stay runSync-compatible.
 */
export const {
  coordinateEmailAddress,
  coordinateEmailRegistration,
  makeEmailAddressServices,
  makeEmailRegistrationServices,
  makeEmailSignInServices,
} = emailTarget;

/**
 * Password mutations and registration must own their outer transactionSync.
 * Arbitrary raw Drizzle nesting is not detectable; owner bodies must remain
 * runSync-compatible. Detectable Effect commit scopes are rejected pre-write.
 */
export const {
  coordinatePasswordPersistence,
  coordinatePasswordRegistration,
  makePasswordPersistenceServices,
  makePasswordRegistrationServices,
} = passwordTarget;

/**
 * Proof mutations and coordinateProofPersistence must own their outermost
 * transactionSync call. The installed driver cannot detect an arbitrary raw
 * Drizzle outer transaction; calling either boundary from one is unsupported.
 * The owner body must remain runSync-compatible.
 */
export const { coordinateProofPersistence, makeProofPersistenceServices } = proofTarget;

/**
 * Session mutation methods and coordinate* functions must own their outermost
 * transactionSync call. The installed Drizzle driver exposes no context marker
 * for an arbitrary raw outer database.transaction call, so invoking either
 * boundary from one is unsupported and cannot be detected. Detectable Effect
 * commit scopes are rejected before writes.
 */
export const {
  coordinateAuthenticationAuthority,
  coordinatePendingAuthentication,
  coordinateSignedSessionValidity,
  coordinateStatefulSessions,
  makeAuthenticationAuthorityServices,
  makePendingAuthenticationServices,
  makeSessionStepUpServices,
  coordinateSessionStepUp,
  makeSignedSessionValidityServices,
  makeStatefulSessionServices,
} = sessionTarget;

export const commitMode = "synchronous" as const;

export const makeIdentityServices = <
  Subject extends AnySQLiteTable,
  Identifier extends AnySQLiteTable,
  External extends AnySQLiteTable,
  Request extends AnySQLiteTable,
  NativeId,
>(
  mapping: IdentityTables<Subject, Identifier, External, Request, NativeId>,
) =>
  makeSqliteIdentityServices(mapping, "synchronous").pipe(
    Effect.provideServiceEffect(NativeDatabase, nativeDatabase(Database)),
  );

export const makeSubjectProvisioningServices = <
  Subject extends AnySQLiteTable,
  Identifier extends AnySQLiteTable,
  Request extends AnySQLiteTable,
  NativeId,
>(
  mapping: SubjectProvisioningTables<Subject, Identifier, Request, NativeId>,
) =>
  makeSqliteSubjectProvisioningServices(mapping, "synchronous").pipe(
    Effect.provideServiceEffect(NativeDatabase, nativeDatabase(Database)),
  );

export const makeExternalIdentityServices = <
  Subject extends AnySQLiteTable,
  External extends AnySQLiteTable,
  NativeId,
>(
  mapping: ExternalIdentityTables<Subject, External, NativeId>,
) =>
  makeSqliteExternalIdentityServices(mapping).pipe(
    Effect.provideServiceEffect(NativeDatabase, nativeDatabase(Database)),
  );

import { makeSqlitePasswordPreparedTarget } from "./drizzle/sqlite-password-prepared";

const passwordPreparedTarget = makeSqlitePasswordPreparedTarget<
  Database,
  EffectSQLiteDoDatabase<AnyRelations>,
  true
>(Database, sqlitePasswordConfiguration("synchronous", Effect.void, Effect.void));

export const { makePasswordPreparedPersistenceServices, coordinatePasswordPreparedPersistence } =
  passwordPreparedTarget;

export { passwordPreparedPersistenceLayer } from "./drizzle/password-prepared-target";

import { makeOAuthTarget } from "./drizzle/oauth-drivers";

const oauthTarget = makeOAuthTarget<
  Database,
  EffectSQLiteDoDatabase<AnyRelations>,
  AnySQLiteTable<{ dialect: "sqlite" }>,
  true
>(Database, {
  mode: "synchronous",
  dialect: "sqlite",
  locking: false,
  standaloneGuard: () => Effect.void,
});

export const {
  makeOAuthAccountsServices,
  makeOAuthSignInServices,
  makeOAuthRegistrationIntentServices,
  makeOAuthRegistrationServices,
  coordinateOAuthRegistration,
  coordinateOAuthSignIn,
  coordinateOAuthRegistrationIntents,
  coordinateOAuthAccounts,
  makeOAuthConnectedServices,
  makeOAuthConnectedRevocationServices,
  coordinateOAuthConnected,
  coordinateOAuthConnectedRevocations,
} = oauthTarget;

import { makePasskeyTarget } from "./drizzle/passkey-drivers";

const passkeyTarget = makePasskeyTarget<
  Database,
  EffectSQLiteDoDatabase<AnyRelations>,
  AnySQLiteTable<{ dialect: "sqlite" }>,
  unknown,
  true
>(Database, {
  mode: "synchronous",
  dialect: "sqlite",
  locking: false,
  standaloneGuard: () => Effect.void,
});

export const {
  makePasskeyCredentialServices,
  makePasskeyPersistenceServices,
  makePasskeyEnrollmentContextServices,
  makePasskeyRegistrationCeremonyServices,
  coordinatePasskeyPersistence,
  coordinatePasskeyRegistrationCeremony,
  makePasskeyManagementServices,
  makePasskeyRegistrationServices,
  coordinatePasskeyManagement,
  coordinatePasskeyRegistration,
} = passkeyTarget;

import { makeTotpTarget } from "./drizzle/totp-target";

const totpTarget = makeTotpTarget<
  Database,
  EffectSQLiteDoDatabase<AnyRelations>,
  AnySQLiteTable<{ dialect: "sqlite" }>,
  unknown,
  true
>(Database, {
  mode: "synchronous",
  dialect: "sqlite",
  locking: false,
  standaloneGuard: () => Effect.void,
});

export const { makeTotpPersistenceServices, coordinateTotpPersistence } = totpTarget;

import { makePhoneTarget } from "./drizzle/phone-target";

const phoneTarget = makePhoneTarget<
  Database,
  EffectSQLiteDoDatabase<AnyRelations>,
  AnySQLiteTable<{ dialect: "sqlite" }>,
  unknown,
  true
>(Database, {
  mode: "synchronous",
  dialect: "sqlite",
  locking: false,
  standaloneGuard: () => Effect.void,
});

export const { makePhonePersistenceServices, coordinatePhonePersistence } = phoneTarget;
