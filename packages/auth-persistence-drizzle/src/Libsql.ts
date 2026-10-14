import type { AnyRelations } from "drizzle-orm";
import {
  EffectLibsqlTransaction as PasskeyTransaction,
  type EffectLibsqlDatabase,
  makeWithDefaults,
} from "drizzle-orm/effect-libsql";
import type { AnySQLiteTable } from "drizzle-orm/sqlite-core";
import { Context, Effect, Layer } from "effect";

import { NativeDatabase, nativeDatabase } from "./drizzle/native-database";

/** The application-owned Drizzle database used to construct persistence services. */
export class Database extends Context.Service<Database, EffectLibsqlDatabase<AnyRelations>>()(
  "effect-auth/persistence-drizzle/Libsql/Database",
) {}

/** Construct Drizzle from the driver's SQL-client Layer. */
export const databaseLayer = Layer.effect(Database, makeWithDefaults({}));

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
  transactionConstructor: PasskeyTransaction,
});

const passwordTarget = makePasswordTarget(Database, {
  mode: "native",
  dialect: "sqlite",
  transactionConstructor: PasskeyTransaction,
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
  transactionConstructor: PasskeyTransaction,
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
  EffectLibsqlDatabase<AnyRelations>,
  AnySQLiteTable<{ dialect: "sqlite" }>
>(Database, {
  mode: "native",
  dialect: "sqlite",
  transactionConstructor: PasskeyTransaction,
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
  EffectLibsqlDatabase<AnyRelations>,
  AnySQLiteTable<{ dialect: "sqlite" }>
>(Database, {
  transactionConstructor: PasskeyTransaction,
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
  { mode: "native", dialect: "sqlite", transactionConstructor: PasskeyTransaction },
);

import { drizzleMigrationsLayer } from "./internal/drizzle-migrations";
import { sqlitePersistence } from "./internal/drizzle-sqlite";

export const AuthPersistence = {
  ...sqlitePersistence(makeWithDefaults({})),
  migrationsLayer: drizzleMigrationsLayer(
    makeWithDefaults({}),
    Effect.promise(() => import("drizzle-orm/effect-libsql/migrator")).pipe(
      Effect.map((module) => module.migrate),
    ),
  ),
};

export { OAuthProxyPersistence } from "./internal/drizzle-sqlite-oauth-proxy";

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
  transactionConstructor: PasskeyTransaction,
});

import { makeTotpTarget } from "./drizzle/totp-target";

export const { makeTotpPersistenceServices, coordinateTotpPersistence } = makeTotpTarget(Database, {
  mode: "native",
  dialect: "sqlite",
  transactionConstructor: PasskeyTransaction,
});
