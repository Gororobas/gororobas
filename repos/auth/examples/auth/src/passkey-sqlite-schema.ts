import { Passkey, Schema as AuthSchema } from "@yielded/auth";
import {
  passkeyInvalidationMutation,
  requiredPasskeyCredentialConstraints,
  requiredPasskeyPersistenceConstraints,
  type PasskeyCredentialMapping,
  type PasskeyManagementMapping,
  type PasskeyRegistrationMapping,
  type PasskeyWriteTables,
} from "@yielded/auth-persistence-drizzle";
import { sql } from "drizzle-orm";
import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core";
import { Effect, Schema } from "effect";
import * as SqlClient from "effect/sql/SqlClient";

export const subject = sqliteTable("passkey_subject", {
  id: text().primaryKey(),
  status: text().notNull(),
  securityRevision: text().notNull(),
  name: text().notNull(),
});

export const factor = sqliteTable("passkey_factor", {
  subjectId: text().notNull(),
  credentialId: text().primaryKey(),
  revision: text().notNull(),
  status: text().notNull(),
});

export const credential = sqliteTable("passkey_credential", {
  credentialId: text().primaryKey(),
  subjectId: text().notNull(),
  rpId: text().notNull(),
  protocolCredentialId: text().notNull(),
  credentialKey: text().notNull().unique(),
  userHandle: text().notNull(),
  publicKey: text().notNull(),
  algorithm: integer().notNull(),
  profile: text().notNull(),
  credentialRevision: text().notNull(),
  status: text().notNull(),
  primarySignIn: integer({ mode: "boolean" }).notNull(),
  enrollmentUserVerified: integer({ mode: "boolean" }).notNull(),
  backupEligible: integer({ mode: "boolean" }).notNull(),
  backupState: integer({ mode: "boolean" }).notNull(),
  counter: integer().notNull(),
  name: text().notNull(),
  createdAt: integer().notNull(),
  lastUsedAt: integer(),
});

export const flow = sqliteTable("passkey_flow", {
  moduleId: text().notNull(),
  flowId: text().primaryKey(),
  purpose: text().notNull(),
  snapshot: text().notNull(),
  applicationSnapshot: text(),
  requestBindingVerifier: text().notNull(),
  requestBindingExpiresAt: integer().notNull(),
  issuedAt: integer().notNull(),
  expiresAt: integer().notNull(),
});

export const session = sqliteTable("passkey_session", {
  id: text().primaryKey(),
  subjectId: text().notNull(),
  revision: text().notNull(),
  status: text().notNull(),
});

export const pending = sqliteTable("passkey_pending", {
  id: text().primaryKey(),
  subjectId: text().notNull(),
  revision: text().notNull(),
  status: text().notNull(),
});

export const registrationSchema = Schema.Struct({
  accountId: Schema.NonEmptyString,
  name: Schema.NonEmptyString,
});

export const profile = Passkey.PasskeyProfile.make({
  profileId: "primary",
  rpId: "localhost",
  rpName: "Passkey example",
  origins: ["http://localhost:4179"],
  developmentLocalhost: true,
  residentKey: "required",
  userVerification: "required",
  primarySignIn: true,
  attestation: "none",
  algorithms: [-7, -257],
});

export const policy = Passkey.PasskeyMethodPolicy.make({
  profiles: [profile],
  lifetimeMillis: 120000,
  admission: {
    global: { limit: 1000, windowMillis: 60000 },
    subject: { limit: 100, windowMillis: 60000 },
    target: { limit: 100, windowMillis: 60000 },
  },
});

export const management = Passkey.PasskeyManagementPolicy.make({
  maximumCredentials: 5,
  maximumEvidenceAgeMillis: 120000,
  requireImmediateInvalidation: true,
});

export const requirement = Passkey.PasskeyRequirement.make({
  maximumAgeMillis: 120000,
  alternatives: [
    { factors: ["possession"], minimumCredentials: 1, userVerified: true, phishingResistant: true },
  ],
});

const profileCodec = Schema.fromJsonString(Passkey.PasskeyProfile);
const active = (value: unknown) => value === "active";

export const read = {
  subject: {
    table: subject,
    id: "id",
    status: "status",
    securityRevision: "securityRevision",
    decodeId: (row) => row.id!,
    decodeRequirement: () => Effect.succeed(requirement),
    isActiveStatus: active,
    activeCondition: sql`${subject.status} = 'active'`,
  },
  credential: {
    table: credential,
    credentialId: "credentialId",
    subjectId: "subjectId",
    rpId: "rpId",
    protocolCredentialId: "protocolCredentialId",
    credentialKey: "credentialKey",
    userHandle: "userHandle",
    publicKey: "publicKey",
    algorithm: "algorithm",
    profile: "profile",
    credentialRevision: "credentialRevision",
    status: "status",
    primarySignIn: "primarySignIn",
    enrollmentUserVerified: "enrollmentUserVerified",
    backupEligible: "backupEligible",
    backupState: "backupState",
    counter: "counter",
    decode: (row) =>
      // oxlint-disable-next-line no-restricted-properties -- the partial native database row is decoded at the storage boundary.
      Schema.decodeUnknownSync(
        Passkey.PasskeyCredential.mapFields(
          ({ revision: _revision, active: _active, requirement: _requirement, ...fields }) =>
            fields,
        ),
      )({ ...row, profile: Schema.decodeSync(profileCodec)(row.profile!) }),
    decodeSubjectId: (row) => row.subjectId!,
    isActiveStatus: active,
    activeCondition: sql`${credential.status} = 'active'`,
  },
  authority: {
    table: factor,
    subjectId: "subjectId",
    credentialId: "credentialId",
    revision: "revision",
    status: "status",
    isActiveStatus: active,
    activeCondition: sql`${factor.status} = 'active'`,
  },
  subjectIds: {
    toNative: (id: AuthSchema.SubjectId) => String(id),
    toSubject: AuthSchema.SubjectId.make,
    equals: (left: string, right: string) => left === right,
  },
  constraints: requiredPasskeyCredentialConstraints,
} satisfies PasskeyCredentialMapping<typeof subject, typeof credential, typeof factor, string>;

export const write = {
  credential: {
    name: "name",
    createdAt: "createdAt",
    encodeInsert: (input) => ({
      credentialId: input.credential.credentialId,
      rpId: input.credential.rpId,
      protocolCredentialId: input.credential.protocolCredentialId,
      userHandle: input.credential.userHandle,
      algorithm: input.credential.algorithm,
      primarySignIn: input.credential.primarySignIn,
      enrollmentUserVerified: input.credential.enrollmentUserVerified,
      backupEligible: input.credential.backupEligible,
      backupState: input.credential.backupState,
      counter: input.credential.counter,
      subjectId: input.subjectId,
      profile: Schema.encodeSync(profileCodec)(input.credential.profile),
      publicKey: input.credential.publicKey,
      credentialRevision: input.marker,
      credentialKey: "",
      status: "active",
      name: input.summary.name,
      createdAt: input.summary.createdAtMillis,
    }),
    encodePrimarySignIn: (value) => value,
    encodeEnrollmentUserVerified: (value) => value,
    encodeBackupEligible: (value) => value,
    activeStatus: "active",
    removedStatus: "removed",
  },
  authority: {
    encodeInsert: (input) => ({
      subjectId: input.subjectId,
      credentialId: input.credential.credentialId,
      revision: input.marker,
      status: "active",
    }),
    activeStatus: "active",
    removedStatus: "removed",
  },
  policy: {
    subjectColumns: ["name"],
    management: () => management,
    requirement: () => Effect.succeed(requirement),
    metadata: (id) =>
      sql`exists(select 1 from ${subject} where ${subject.id} = ${id} and ${subject.status} = 'active')`,
    action: () => sql`1 = 1`,
    remainingSignIn: (id, excluded) =>
      Effect.succeed(
        sql`exists(select 1 from ${credential} where ${credential.subjectId} = ${id} and ${credential.credentialId} <> ${excluded} and ${credential.status} = 'active' and ${credential.primarySignIn} = 1 and ${credential.enrollmentUserVerified} = 1)`,
      ),
  },
} satisfies PasskeyWriteTables<typeof subject, typeof credential, typeof factor, string>;

export const base = {
  moduleId: "example-passkey",
  read,
  flow: {
    table: flow,
    moduleId: "moduleId",
    flowId: "flowId",
    purpose: "purpose",
    snapshot: "snapshot",
    requestBindingVerifier: "requestBindingVerifier",
    requestBindingExpiresAt: "requestBindingExpiresAt",
    issuedAt: "issuedAt",
    expiresAt: "expiresAt",
    encodeInsert: () => ({
      moduleId: "",
      flowId: "",
      purpose: "",
      snapshot: "",
      requestBindingVerifier: "",
      requestBindingExpiresAt: 0,
      issuedAt: 0,
      expiresAt: 0,
    }),
  },
  clock: {
    encodeInstant: (millis: number) => millis,
    // oxlint-disable-next-line no-restricted-properties -- the native driver timestamp column is an unknown boundary.
    decodeInstant: (value: unknown) => Schema.decodeUnknownSync(Schema.Int)(value),
    engineNowMillis: sql`cast(unixepoch('subsec') * 1000 as integer)`,
    toMillis: (expression: ReturnType<typeof sql>) => expression,
    fromMillis: (expression: ReturnType<typeof sql>) => expression,
  },
  telemetry: {
    lastUsedAt: "lastUsedAt",
    encodeBackupState: (value: boolean) => value,
    encodeBackupEligible: (value: boolean) => value,
  },
  constraints: requiredPasskeyPersistenceConstraints,
} as const;

export const invalidation = {
  trigger: "credential-change",
  existingSessions: "immediate",
  maximumExposureMillis: 0,
  oldAuthenticationEvidence: "rejected",
} as const;

export const managementMapping = {
  ...base,
  write,
  invalidation: {
    window: invalidation,
    mutations: [session, pending].map((table) =>
      passkeyInvalidationMutation({
        table,
        where: (input: { subjectId: string }) =>
          sql`${table.subjectId} = ${input.subjectId} and ${table.status} = 'active'`,
        values: () => ({ status: "revoked" }),
        postcondition: (input: { subjectId: string }) =>
          sql`not exists(select 1 from ${table} where ${table.subjectId} = ${input.subjectId} and ${table.status} = 'active')`,
      }),
    ),
    postcondition: (input) =>
      sql`exists(select 1 from ${subject} where ${subject.id} = ${input.subjectId} and ${subject.securityRevision} = ${input.securityRevision})`,
  },
} satisfies PasskeyManagementMapping<
  typeof subject,
  typeof credential,
  typeof factor,
  typeof flow,
  string
>;

export const registrationMapping = {
  ...base,
  write,
  applicationSnapshot: "applicationSnapshot",
  registration: {
    schema: registrationSchema,
    describe: (value) => ({ name: value.name, displayName: value.name }),
    eligible: (value) =>
      sql`not exists(select 1 from ${subject} where ${subject.id} = ${value.accountId})`,
    finalEligibility: ({ registration, subjectId }) =>
      sql`exists(select 1 from ${subject} where ${subject.id} = ${subjectId} and ${subject.name} = ${registration.name} and ${subject.status} = 'active')`,
    subject: ({ registration, marker }) => ({
      subjectId: registration.accountId,
      values: {
        id: registration.accountId,
        status: "active",
        securityRevision: marker,
        name: registration.name,
      },
    }),
    activeStatus: "active",
  },
} satisfies PasskeyRegistrationMapping<
  typeof subject,
  typeof credential,
  typeof factor,
  typeof flow,
  string,
  typeof registrationSchema.Type
>;

/** The application owns these migrations and all identity/profile policy choices. */
export const migrate = Effect.gen(function* () {
  const client = yield* SqlClient.SqlClient;

  for (const ddl of migrations) yield* client.unsafe(ddl);
});

export const migrations = [
  "create table passkey_subject (id text primary key, status text not null, securityRevision text not null, name text not null)",
  "create table passkey_factor (subjectId text not null, credentialId text primary key, revision text not null, status text not null)",
  "create table passkey_credential (credentialId text primary key, subjectId text not null, rpId text not null, protocolCredentialId text not null, credentialKey text not null unique, userHandle text not null, publicKey text not null, algorithm integer not null, profile text not null, credentialRevision text not null, status text not null, primarySignIn integer not null, enrollmentUserVerified integer not null, backupEligible integer not null, backupState integer not null, counter integer not null, name text not null, createdAt integer not null, lastUsedAt integer)",
  "create table passkey_flow (moduleId text not null, flowId text primary key, purpose text not null, snapshot text not null, applicationSnapshot text, requestBindingVerifier text not null, requestBindingExpiresAt integer not null, issuedAt integer not null, expiresAt integer not null)",
  "create table passkey_session (id text primary key, subjectId text not null, revision text not null, status text not null)",
  "create table passkey_pending (id text primary key, subjectId text not null, revision text not null, status text not null)",
] as const;
