import type { AnyRelations } from "drizzle-orm";
import { type EffectMysql2Database, makeWithDefaults } from "drizzle-orm/effect-mysql2";
import type { AnyMySqlTable } from "drizzle-orm/mysql-core";
import { Layer } from "effect";

import type {
  IdentityTables,
  SubjectProvisioningTables,
  ExternalIdentityTables,
} from "./drizzle/model";
import { Database } from "./drizzle/mysql-database";
import {
  makeMysqlExternalIdentityServices,
  makeMysqlIdentityServices,
  makeMysqlSubjectProvisioningServices,
} from "./drizzle/mysql-identity";

export { Database } from "./drizzle/mysql-database";

export {
  coordinateMysqlAuthenticationAuthority as coordinateAuthenticationAuthority,
  coordinateMysqlPendingAuthentication as coordinatePendingAuthentication,
  coordinateMysqlSignedSessionValidity as coordinateSignedSessionValidity,
  coordinateMysqlStatefulSessions as coordinateStatefulSessions,
  makeMysqlAuthenticationAuthorityServices as makeAuthenticationAuthorityServices,
  makeMysqlPendingAuthenticationServices as makePendingAuthenticationServices,
  makeMysqlSignedSessionValidityServices as makeSignedSessionValidityServices,
  makeMysqlStatefulSessionServices as makeStatefulSessionServices,
} from "./drizzle/mysql-sessions";

export {
  coordinateMysqlProofPersistence as coordinateProofPersistence,
  makeMysqlProofPersistenceServices as makeProofPersistenceServices,
} from "./drizzle/mysql-proofs";

export {
  coordinateMysqlPasswordPersistence as coordinatePasswordPersistence,
  coordinateMysqlPasswordRegistration as coordinatePasswordRegistration,
  makeMysqlPasswordPersistenceServices as makePasswordPersistenceServices,
  makeMysqlPasswordRegistrationServices as makePasswordRegistrationServices,
} from "./drizzle/mysql-passwords";

export {
  coordinateMysqlEmailAddress as coordinateEmailAddress,
  coordinateMysqlEmailRegistration as coordinateEmailRegistration,
  makeMysqlEmailAddressServices as makeEmailAddressServices,
  makeMysqlEmailRegistrationServices as makeEmailRegistrationServices,
  makeMysqlEmailSignInServices as makeEmailSignInServices,
} from "./drizzle/mysql-emails";

export const makeSubjectProvisioningServices = <
  Subject extends AnyMySqlTable,
  Identifier extends AnyMySqlTable,
  Request extends AnyMySqlTable,
  NativeId,
>(
  mapping: SubjectProvisioningTables<Subject, Identifier, Request, NativeId>,
) => makeMysqlSubjectProvisioningServices(mapping);

export const makeExternalIdentityServices = <
  Subject extends AnyMySqlTable,
  External extends AnyMySqlTable,
  NativeId,
>(
  mapping: ExternalIdentityTables<Subject, External, NativeId>,
) => makeMysqlExternalIdentityServices(mapping);

export const commitMode = "interactive" as const;

export const makeIdentityServices = <
  Subject extends AnyMySqlTable,
  Identifier extends AnyMySqlTable,
  External extends AnyMySqlTable,
  Request extends AnyMySqlTable,
  NativeId,
>(
  mapping: IdentityTables<Subject, Identifier, External, Request, NativeId>,
) => makeMysqlIdentityServices(mapping);

export {
  makeMysqlSessionStepUpServices as makeSessionStepUpServices,
  coordinateMysqlSessionStepUp as coordinateSessionStepUp,
} from "./drizzle/mysql-sessions";

export {
  makeMySqlPasswordPreparedPersistenceServices as makePasswordPreparedPersistenceServices,
  coordinateMySqlPasswordPreparedPersistence as coordinatePasswordPreparedPersistence,
} from "./drizzle/mysql-password-prepared";

export { passwordPreparedPersistenceLayer } from "./drizzle/password-prepared-target";

import { makeOAuthTarget } from "./drizzle/oauth-drivers";
import { mysqlOAuthTransaction } from "./drizzle/oauth-mysql";
import { sqlClientOAuthStandaloneGuard } from "./drizzle/oauth-target";

const oauthTarget = makeOAuthTarget<
  Database,
  EffectMysql2Database<AnyRelations>,
  AnyMySqlTable<{ dialect: "mysql" }>
>(Database, {
  mode: "interactive",
  dialect: "mysql",
  locking: true,
  transaction: mysqlOAuthTransaction,
  standaloneGuard: sqlClientOAuthStandaloneGuard,
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
import { unavailable as passkeyUnavailable } from "./drizzle/passkey-state";
import { sqlClientPasskeyStandaloneGuard } from "./drizzle/passkey-target";
import { mysqlTransaction } from "./drizzle/transaction-mysql";

const passkeyTarget = makePasskeyTarget<
  Database,
  EffectMysql2Database<AnyRelations>,
  AnyMySqlTable<{ dialect: "mysql" }>
>(Database, {
  mode: "interactive",
  dialect: "mysql",
  locking: true,
  standaloneGuard: sqlClientPasskeyStandaloneGuard,
  transaction: (database, body) => mysqlTransaction(passkeyUnavailable, database, body),
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

import { unavailable as totpUnavailable } from "./drizzle/totp-state";
import { makeTotpTarget, sqlClientTotpStandaloneGuard } from "./drizzle/totp-target";

const totpTarget = makeTotpTarget<
  Database,
  EffectMysql2Database<AnyRelations>,
  AnyMySqlTable<{ dialect: "mysql" }>
>(Database, {
  mode: "interactive",
  dialect: "mysql",
  locking: true,
  standaloneGuard: sqlClientTotpStandaloneGuard,
  transaction: (database, body) => mysqlTransaction(totpUnavailable, database, body),
});

export const { makeTotpPersistenceServices, coordinateTotpPersistence } = totpTarget;

import { unavailable as phoneUnavailable } from "./drizzle/phone-state";
import { makePhoneTarget, sqlClientPhoneStandaloneGuard } from "./drizzle/phone-target";

const phoneTarget = makePhoneTarget<
  Database,
  EffectMysql2Database<AnyRelations>,
  AnyMySqlTable<{ dialect: "mysql" }>
>(Database, {
  mode: "interactive",
  dialect: "mysql",
  locking: true,
  standaloneGuard: sqlClientPhoneStandaloneGuard,
  transaction: (database, body) => mysqlTransaction(phoneUnavailable, database, body),
});

export const { makePhonePersistenceServices, coordinatePhonePersistence } = phoneTarget;

/** Construct Drizzle from the driver's SQL-client Layer. */
export const databaseLayer = Layer.effect(Database, makeWithDefaults({}));
