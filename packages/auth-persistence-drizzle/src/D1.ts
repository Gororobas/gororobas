import type { D1Client } from "@effect/sql-d1/D1Client";
export { makeTotpPersistenceServices, coordinateTotpPersistence } from "./drizzle/d1-totp";
import type { AnyRelations } from "drizzle-orm";
import { type EffectSQLiteD1Database, makeWithDefaults } from "drizzle-orm/effect-d1";
import type { AnySQLiteTable } from "drizzle-orm/sqlite-core";

import { Database } from "./drizzle/d1-database";
export { Database } from "./drizzle/d1-database";

export {
  makeD1OAuthAccountsServices as makeOAuthAccountsServices,
  makeD1OAuthSignInServices as makeOAuthSignInServices,
  makeD1OAuthRegistrationIntentServices as makeOAuthRegistrationIntentServices,
  makeD1OAuthRegistrationServices as makeOAuthRegistrationServices,
  coordinateD1OAuthRegistration as coordinateOAuthRegistration,
  coordinateD1OAuthSignIn as coordinateOAuthSignIn,
  coordinateD1OAuthRegistrationIntents as coordinateOAuthRegistrationIntents,
  coordinateD1OAuthAccounts as coordinateOAuthAccounts,
} from "./drizzle/d1-oauth";

import {
  makeD1ExternalIdentityServices,
  makeD1IdentityServices,
  makeD1SubjectProvisioningServices,
} from "./drizzle/d1-identity";

export {
  coordinateD1AuthenticationAuthority as coordinateAuthenticationAuthority,
  coordinateD1PendingAuthentication as coordinatePendingAuthentication,
  coordinateD1SignedSessionValidity as coordinateSignedSessionValidity,
  coordinateD1StatefulSessions as coordinateStatefulSessions,
  makeD1AuthenticationAuthorityServices as makeAuthenticationAuthorityServices,
  makeD1PendingAuthenticationServices as makePendingAuthenticationServices,
  makeD1SignedSessionValidityServices as makeSignedSessionValidityServices,
  makeD1StatefulSessionServices as makeStatefulSessionServices,
} from "./drizzle/d1-sessions";

export {
  coordinateD1ProofPersistence as coordinateProofPersistence,
  makeD1ProofPersistenceServices as makeProofPersistenceServices,
} from "./drizzle/d1-proofs";

export {
  coordinateD1PasswordPersistence as coordinatePasswordPersistence,
  coordinateD1PasswordRegistration as coordinatePasswordRegistration,
  makeD1PasswordPersistenceServices as makePasswordPersistenceServices,
  makeD1PasswordRegistrationServices as makePasswordRegistrationServices,
} from "./drizzle/d1-passwords";

export {
  coordinateD1EmailAddress as coordinateEmailAddress,
  coordinateD1EmailRegistration as coordinateEmailRegistration,
  makeD1EmailAddressServices as makeEmailAddressServices,
  makeD1EmailRegistrationServices as makeEmailRegistrationServices,
  makeD1EmailSignInServices as makeEmailSignInServices,
} from "./drizzle/d1-emails";

import type {
  D1GeneratedIdentityMapping,
  D1SubjectProvisioningMapping,
  D1ExternalIdentityMapping,
} from "./drizzle/model";

export const makeSubjectProvisioningServices = <
  Subject extends AnySQLiteTable,
  Identifier extends AnySQLiteTable,
  Request extends AnySQLiteTable,
  NativeId,
>(
  mapping: D1SubjectProvisioningMapping<Subject, Identifier, Request, NativeId>,
) => makeD1SubjectProvisioningServices(mapping);

export const makeExternalIdentityServices = <
  Subject extends AnySQLiteTable,
  External extends AnySQLiteTable,
  NativeId,
>(
  mapping: D1ExternalIdentityMapping<Subject, External, NativeId>,
) => makeD1ExternalIdentityServices(mapping);

export const commitMode = "batch" as const;

export const makeIdentityServices = <
  Subject extends AnySQLiteTable,
  Identifier extends AnySQLiteTable,
  External extends AnySQLiteTable,
  Request extends AnySQLiteTable,
  NativeId,
>(
  mapping: D1GeneratedIdentityMapping<Subject, Identifier, External, Request, NativeId>,
) => makeD1IdentityServices(mapping);

export {
  makeD1SessionStepUpServices as makeSessionStepUpServices,
  coordinateD1SessionStepUp as coordinateSessionStepUp,
} from "./drizzle/d1-sessions";

export {
  makeD1PasswordPreparedPersistenceServices as makePasswordPreparedPersistenceServices,
  coordinateD1PasswordPreparedPersistence as coordinatePasswordPreparedPersistence,
} from "./drizzle/d1-password-prepared";

export { passwordPreparedPersistenceLayer } from "./drizzle/password-prepared-target";

import { Effect, Layer } from "effect";

import { makeD1OAuthConnectedTarget } from "./drizzle/oauth-connected-drivers";
import type { OAuthD1Mapping } from "./drizzle/oauth-model";

const connectedTarget = makeD1OAuthConnectedTarget<
  Database,
  EffectSQLiteD1Database<AnyRelations> & { readonly $client: D1Client },
  AnySQLiteTable<{ dialect: "sqlite" }>,
  OAuthD1Mapping
>(Database, {
  mode: "batch",
  dialect: "sqlite",
  locking: false,
  standaloneGuard: () => Effect.void,
});

export const {
  makeOAuthConnectedServices,
  makeOAuthConnectedRevocationServices,
  coordinateOAuthConnected,
  coordinateOAuthConnectedRevocations,
} = connectedTarget;

export {
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
} from "./drizzle/d1-passkey";

export { D1BatchStatements } from "./drizzle/D1BatchStatements";

export { makePhonePersistenceServices, coordinatePhonePersistence } from "./drizzle/d1-phone";

/** Construct Drizzle from the driver's SQL-client Layer. */
export const databaseLayer = Layer.effect(Database, makeWithDefaults({}));
