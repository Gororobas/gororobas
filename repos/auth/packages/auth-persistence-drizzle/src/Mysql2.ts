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

import { makeProofTarget } from "./drizzle/proof-drivers";

export const { coordinateProofPersistence, makeProofPersistenceServices } = makeProofTarget(
  Database,
  { mode: "native", dialect: "mysql" },
);

import { makePasswordTarget } from "./drizzle/password-drivers";

export const {
  coordinatePasswordPersistence,
  coordinatePasswordRegistration,
  makePasswordPersistenceServices,
  makePasswordRegistrationServices,
} = makePasswordTarget(Database, { mode: "native", dialect: "mysql" });

import { makeEmailTarget } from "./drizzle/email-drivers";

export const {
  makeEmailSignInServices,
  makeEmailAddressServices,
  makeEmailRegistrationServices,
  coordinateEmailAddress,
  coordinateEmailRegistration,
} = makeEmailTarget(Database, { mode: "native", dialect: "mysql" });

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

export const makeIdentityServices = <
  Subject extends AnyMySqlTable,
  Identifier extends AnyMySqlTable,
  External extends AnyMySqlTable,
  Request extends AnyMySqlTable,
  NativeId,
>(
  mapping: IdentityTables<Subject, Identifier, External, Request, NativeId>,
) => makeMysqlIdentityServices(mapping);

import { makeOAuthTarget } from "./drizzle/oauth-drivers";

const oauthTarget = makeOAuthTarget<
  Database,
  EffectMysql2Database<AnyRelations>,
  AnyMySqlTable<{ dialect: "mysql" }>
>(Database, {
  mode: "native",
  dialect: "mysql",
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
  EffectMysql2Database<AnyRelations>,
  AnyMySqlTable<{ dialect: "mysql" }>
>(Database, {
  mode: "native",
  dialect: "mysql",
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
  { mode: "native", dialect: "mysql" },
);

/** Construct Drizzle from the driver's SQL-client Layer. */
export const databaseLayer = Layer.effect(Database, makeWithDefaults({}));

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
} = makeSessionTarget(Database, { mode: "native", dialect: "mysql" });

import { makeTotpTarget } from "./drizzle/totp-target";

export const { makeTotpPersistenceServices, coordinateTotpPersistence } = makeTotpTarget(Database, {
  mode: "native",
  dialect: "mysql",
});
