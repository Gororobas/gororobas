export { OAuthProxyPersistence } from "./internal/drizzle-sqlite-oauth-proxy";

import type { D1Client } from "@effect/sql-d1/D1Client";
import type { AnyRelations } from "drizzle-orm";
import { type EffectSQLiteD1Database, makeWithDefaults } from "drizzle-orm/effect-d1";
import type { AnySQLiteTable } from "drizzle-orm/sqlite-core";

import { Database } from "./drizzle/d1-database";
export { Database } from "./drizzle/d1-database";

import {
  makeD1ExternalIdentityServices,
  makeD1IdentityServices,
  makeD1SubjectProvisioningServices,
} from "./drizzle/d1-identity";
import { makeProofTarget } from "./drizzle/proof-drivers";

export const { coordinateProofPersistence, makeProofPersistenceServices } = makeProofTarget(
  Database,
  { mode: "batch", dialect: "sqlite" },
);

import { makePasswordTarget } from "./drizzle/password-drivers";

export const {
  coordinatePasswordPersistence,
  coordinatePasswordRegistration,
  makePasswordPersistenceServices,
  makePasswordRegistrationServices,
} = makePasswordTarget(Database, { mode: "batch", dialect: "sqlite" });

import { makeEmailTarget } from "./drizzle/email-drivers";

export const {
  makeEmailSignInServices,
  makeEmailAddressServices,
  makeEmailRegistrationServices,
  coordinateEmailAddress,
  coordinateEmailRegistration,
} = makeEmailTarget(Database, { mode: "batch", dialect: "sqlite" });

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

export const makeIdentityServices = <
  Subject extends AnySQLiteTable,
  Identifier extends AnySQLiteTable,
  External extends AnySQLiteTable,
  Request extends AnySQLiteTable,
  NativeId,
>(
  mapping: D1GeneratedIdentityMapping<Subject, Identifier, External, Request, NativeId>,
) => makeD1IdentityServices(mapping);

import { Layer } from "effect";

import { d1MigrationsLayer } from "./internal/drizzle-d1-migrations";
import { sqlitePersistence } from "./internal/drizzle-sqlite";

/** Managed or mapped auth tables committed through D1's atomic batches.
 * Supply D1Client.layer({ db: env.DB }) with the primary database binding.
 * Registration supplies subject values; the account and credentials commit together.
 */
export const AuthPersistence = {
  ...sqlitePersistence(makeWithDefaults({}), { batch: true }),
  migrationsLayer: d1MigrationsLayer,
};

import type { D1BatchStatements } from "./drizzle/D1BatchStatements";
import { makeOAuthTarget } from "./drizzle/oauth-drivers";
import type { OAuthD1Mapping } from "./drizzle/oauth-model";
import { makePasskeyTarget } from "./drizzle/passkey-drivers";
import type { D1PasskeyMapping } from "./drizzle/passkey-model";

type D1Database = EffectSQLiteD1Database<AnyRelations> & { readonly $client: D1Client };
type D1Table = AnySQLiteTable<{ dialect: "sqlite" }>;

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
} = makeOAuthTarget<Database, D1Database, D1Table, OAuthD1Mapping, D1BatchStatements>(Database, {
  mode: "batch",
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
} = makePasskeyTarget<Database, D1Database, D1Table, D1PasskeyMapping, D1BatchStatements>(
  Database,
  { mode: "batch", dialect: "sqlite" },
);

export { D1BatchStatements } from "./drizzle/D1BatchStatements";

import { makePhoneTarget } from "./drizzle/phone-drivers";

export const { makePhonePersistenceServices, coordinatePhonePersistence } = makePhoneTarget(
  Database,
  { mode: "batch", dialect: "sqlite" },
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
} = makeSessionTarget(Database, { mode: "batch", dialect: "sqlite" });

import { makeTotpTarget } from "./drizzle/totp-target";

export const { makeTotpPersistenceServices, coordinateTotpPersistence } = makeTotpTarget(Database, {
  mode: "batch",
  dialect: "sqlite",
});
