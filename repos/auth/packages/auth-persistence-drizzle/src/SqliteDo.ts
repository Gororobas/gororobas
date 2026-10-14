export { OAuthProxyPersistence } from "./internal/drizzle-sqlite-oauth-proxy";

import { SqliteClient } from "@effect/sql-sqlite-do/SqliteClient";
import { PersistenceConfigurationError } from "@yielded/auth-persistence/Adapter";
import type { AnyRelations } from "drizzle-orm";
import { makeWithDefaults } from "drizzle-orm/effect-sqlite-do";

import { NativeDatabase, nativeDatabase } from "./drizzle/native-database";
import {
  makeTransactionHandle,
  type DatabaseValue,
  makeDatabase,
} from "./drizzle/sqlite-do-database";
export { type DatabaseValue, type Transaction, makeDatabase } from "./drizzle/sqlite-do-database";
import type { AnySQLiteTable } from "drizzle-orm/sqlite-core";
import { Context, Effect, Layer } from "effect";

/** The application-owned Drizzle queries with Effect SQL transaction ownership. */
export class Database extends Context.Service<Database, DatabaseValue<AnyRelations>>()(
  "effect-auth/persistence-drizzle/SqliteDo/Database",
) {}

/** Construct Drizzle with asynchronous transactions owned by Effect SQL. */
export const databaseLayer = Layer.effect(
  Database,
  Effect.gen(function* () {
    const client = yield* SqliteClient;
    const storage = client.config.storage;

    if (storage === undefined)
      return yield* PersistenceConfigurationError.make({
        reason: "SqliteDo requires a SQL client configured with Durable Object storage",
      });

    return yield* makeDatabase(yield* makeWithDefaults({ storage }));
  }),
);

import type {
  ExternalIdentityTables,
  IdentityTables,
  SubjectProvisioningTables,
} from "./drizzle/model";
import { makePasswordTarget } from "./drizzle/password-drivers";
import { makeProofTarget } from "./drizzle/proof-drivers";
import {
  makeSqliteExternalIdentityServices,
  makeSqliteIdentityServices,
  makeSqliteSubjectProvisioningServices,
} from "./drizzle/sqlite-identity";

const proofTarget = makeProofTarget(Database, {
  mode: "native",
  dialect: "sqlite",
  transactionFactory: makeTransactionHandle,
});

const passwordTarget = makePasswordTarget(Database, {
  mode: "native",
  dialect: "sqlite",
  transactionFactory: makeTransactionHandle,
});

import { makeEmailTarget } from "./drizzle/email-drivers";

export const {
  makeEmailSignInServices,
  makeEmailAddressServices,
  makeEmailRegistrationServices,
  coordinateEmailAddress,
  coordinateEmailRegistration,
} = makeEmailTarget(Database, {
  mode: "native",
  dialect: "sqlite",
  transactionFactory: makeTransactionHandle,
});

export const {
  coordinatePasswordPersistence,
  coordinatePasswordRegistration,
  makePasswordPersistenceServices,
  makePasswordRegistrationServices,
} = passwordTarget;

export const { coordinateProofPersistence, makeProofPersistenceServices } = proofTarget;

export const makeIdentityServices = <
  Subject extends AnySQLiteTable,
  Identifier extends AnySQLiteTable,
  External extends AnySQLiteTable,
  Request extends AnySQLiteTable,
  NativeId,
>(
  mapping: IdentityTables<Subject, Identifier, External, Request, NativeId>,
) =>
  makeSqliteIdentityServices(mapping, "interactive").pipe(
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
  makeSqliteSubjectProvisioningServices(mapping, "interactive").pipe(
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

import { makeOAuthTarget } from "./drizzle/oauth-drivers";

const oauthTarget = makeOAuthTarget<
  Database,
  DatabaseValue<AnyRelations>,
  AnySQLiteTable<{ dialect: "sqlite" }>
>(Database, {
  mode: "native",
  dialect: "sqlite",
  transactionFactory: makeTransactionHandle,
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
  DatabaseValue<AnyRelations>,
  AnySQLiteTable<{ dialect: "sqlite" }>
>(Database, {
  transactionFactory: makeTransactionHandle,
  mode: "native",
  dialect: "sqlite",
});

export const {
  makePasskeyCredentialServices,
  makePasskeyPersistenceServices,
  makePasskeyRegistrationCeremonyServices,
  coordinatePasskeyPersistence,
  coordinatePasskeyRegistrationCeremony,
  makePasskeyManagementServices,
  makePasskeyRegistrationServices,
  coordinatePasskeyManagement,
  coordinatePasskeyRegistration,
} = passkeyTarget;

import { makePhoneTarget } from "./drizzle/phone-drivers";

export const { makePhonePersistenceServices, coordinatePhonePersistence } = makePhoneTarget(
  Database,
  { mode: "native", dialect: "sqlite", transactionFactory: makeTransactionHandle },
);

import { makeSessionTarget } from "./drizzle/session-drivers";

export const {
  coordinateAuthenticationAuthority,
  coordinatePendingAuthentication,
  coordinateSignedSessionValidity,
  coordinateStatefulSessions,
  makeAuthenticationAuthorityServices,
  makePendingAuthenticationServices,
  makeSignedSessionValidityServices,
  makeStatefulSessionServices,
  makeSessionStepUpServices,
  coordinateSessionStepUp,
  makeSessionCleanupServices,
} = makeSessionTarget(Database, {
  mode: "native",
  dialect: "sqlite",
  transactionFactory: makeTransactionHandle,
});

import { makeTotpTarget } from "./drizzle/totp-target";

export const { makeTotpPersistenceServices, coordinateTotpPersistence } = makeTotpTarget(Database, {
  mode: "native",
  dialect: "sqlite",
  transactionFactory: makeTransactionHandle,
});
