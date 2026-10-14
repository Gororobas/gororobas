export { OAuthProxyPersistence } from "./internal/drizzle-postgres-oauth-proxy";

import type { AnyRelations } from "drizzle-orm";
import {
  EffectPgTransaction as PasskeyTransaction,
  type EffectPgDatabase,
  makeWithDefaults,
} from "drizzle-orm/effect-pglite";
import type { AnyPgTable } from "drizzle-orm/pg-core";
import { Effect, Layer } from "effect";

import type {
  IdentityTables,
  SubjectProvisioningTables,
  ExternalIdentityTables,
} from "./drizzle/model";
import { Database } from "./drizzle/pg-database";
import {
  makePgExternalIdentityServices,
  makePgIdentityServices,
  makePgSubjectProvisioningServices,
} from "./drizzle/pg-identity";

export { Database } from "./drizzle/pg-database";

import { makeProofTarget } from "./drizzle/proof-drivers";

export const { coordinateProofPersistence, makeProofPersistenceServices } = makeProofTarget(
  Database,
  { mode: "native", dialect: "pg", transactionConstructor: PasskeyTransaction },
);

import { makePasswordTarget } from "./drizzle/password-drivers";

export const {
  coordinatePasswordPersistence,
  coordinatePasswordRegistration,
  makePasswordPersistenceServices,
  makePasswordRegistrationServices,
} = makePasswordTarget(Database, {
  mode: "native",
  dialect: "pg",
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
  dialect: "pg",
  transactionConstructor: PasskeyTransaction,
});

export const makeSubjectProvisioningServices = <
  Subject extends AnyPgTable,
  Identifier extends AnyPgTable,
  Request extends AnyPgTable,
  NativeId,
>(
  mapping: SubjectProvisioningTables<Subject, Identifier, Request, NativeId>,
) => makePgSubjectProvisioningServices(mapping);

export const makeExternalIdentityServices = <
  Subject extends AnyPgTable,
  External extends AnyPgTable,
  NativeId,
>(
  mapping: ExternalIdentityTables<Subject, External, NativeId>,
) => makePgExternalIdentityServices(mapping);

export const makeIdentityServices = <
  Subject extends AnyPgTable,
  Identifier extends AnyPgTable,
  External extends AnyPgTable,
  Request extends AnyPgTable,
  NativeId,
>(
  mapping: IdentityTables<Subject, Identifier, External, Request, NativeId>,
) => makePgIdentityServices(mapping);

import { makeOAuthTarget } from "./drizzle/oauth-drivers";

const oauthTarget = makeOAuthTarget<
  Database,
  EffectPgDatabase<AnyRelations>,
  AnyPgTable<{ dialect: "pg" }>
>(Database, {
  mode: "native",
  dialect: "pg",
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
  EffectPgDatabase<AnyRelations>,
  AnyPgTable<{ dialect: "pg" }>
>(Database, {
  transactionConstructor: PasskeyTransaction,
  mode: "native",
  dialect: "pg",
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
  { mode: "native", dialect: "pg", transactionConstructor: PasskeyTransaction },
);

import { drizzleMigrationsLayer } from "./internal/drizzle-migrations";
import { postgresPersistence } from "./internal/drizzle-postgres";

export const AuthPersistence = {
  ...postgresPersistence(makeWithDefaults({})),
  migrationsLayer: drizzleMigrationsLayer(
    makeWithDefaults({}),
    Effect.promise(() => import("drizzle-orm/effect-pglite/migrator")).pipe(
      Effect.map((module) => module.migrate),
    ),
  ),
};

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
} = makeSessionTarget(Database, {
  mode: "native",
  dialect: "pg",
  transactionConstructor: PasskeyTransaction,
});

import { makeTotpTarget } from "./drizzle/totp-target";

export const { makeTotpPersistenceServices, coordinateTotpPersistence } = makeTotpTarget(Database, {
  mode: "native",
  dialect: "pg",
  transactionConstructor: PasskeyTransaction,
});
