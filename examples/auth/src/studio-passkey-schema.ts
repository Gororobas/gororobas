import { Passkey, Schema as AuthSchema } from "@yielded/auth";
import {
  requiredPasskeyCredentialConstraints,
  requiredPasskeyPersistenceConstraints,
  type PasskeyCredentialMapping,
  type PasskeyManagementMapping,
  type PasskeyRegistrationMapping,
  type PasskeyWriteTables,
} from "@yielded/auth-persistence-drizzle";
import { sql } from "drizzle-orm";
import { bigint, boolean, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { Effect, Schema } from "effect";

export const subject = pgTable("studio_passkey_subject", {
  id: uuid().primaryKey(),
  status: text().notNull(),
  securityRevision: text().notNull(),
  name: text().notNull(),
  organization: text().notNull(),
  totpEnabled: boolean().notNull(),
  joinedAt: timestamp({ withTimezone: true, mode: "date" }).notNull(),
});

export const factor = pgTable("studio_passkey_factor", {
  subjectId: uuid().notNull(),
  credentialId: text().primaryKey(),
  revision: text().notNull(),
  status: text().notNull(),
});

export const credential = pgTable("studio_passkey_credential", {
  credentialId: text().primaryKey(),
  subjectId: uuid().notNull(),
  rpId: text().notNull(),
  protocolCredentialId: text().notNull(),
  credentialKey: text().notNull().unique(),
  userHandle: text().notNull(),
  publicKey: text().notNull(),
  algorithm: bigint({ mode: "number" }).notNull(),
  profile: text().notNull(),
  credentialRevision: text().notNull(),
  status: text().notNull(),
  primarySignIn: boolean().notNull(),
  enrollmentUserVerified: boolean().notNull(),
  backupEligible: boolean().notNull(),
  backupState: boolean().notNull(),
  counter: bigint({ mode: "number" }).notNull(),
  name: text().notNull(),
  createdAt: timestamp({ withTimezone: true, mode: "date" }).notNull(),
  lastUsedAt: timestamp({ withTimezone: true, mode: "date" }),
});

export const flow = pgTable("studio_passkey_flow", {
  moduleId: text().notNull(),
  flowId: text().primaryKey(),
  purpose: text().notNull(),
  snapshot: text().notNull(),
  applicationSnapshot: text(),
  requestBindingVerifier: text().notNull(),
  requestBindingExpiresAt: timestamp({ withTimezone: true, mode: "date" }).notNull(),
  issuedAt: timestamp({ withTimezone: true, mode: "date" }).notNull(),
  expiresAt: timestamp({ withTimezone: true, mode: "date" }).notNull(),
});

export { registrationSchema, profile, policy, management, requirement } from "./studio-models";
import { registrationSchema, management, requirement } from "./studio-models";
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
      createdAt: new Date(input.summary.createdAtMillis),
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
    subjectColumns: ["name", "organization", "totpEnabled"],
    management: () => management,
    requirement: () => Effect.succeed(requirement),
    metadata: (id) =>
      sql`exists(select 1 from ${subject} where ${subject.id} = ${id} and ${subject.status} = 'active')`,
    action: () => sql`1 = 1`,
    remainingSignIn: (id, excluded) =>
      Effect.succeed(
        sql`exists(select 1 from ${credential} where ${credential.subjectId} = ${id} and ${credential.credentialId} <> ${excluded} and ${credential.status} = 'active' and ${credential.primarySignIn} = true and ${credential.enrollmentUserVerified} = true)`,
      ),
  },
} satisfies PasskeyWriteTables<typeof subject, typeof credential, typeof factor, string>;

export const base = {
  moduleId: "studio/passkey",
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
      requestBindingExpiresAt: new Date(0),
      issuedAt: new Date(0),
      expiresAt: new Date(0),
    }),
  },
  clock: {
    encodeInstant: (millis: number) => new Date(millis),
    // oxlint-disable-next-line no-restricted-properties -- the native driver timestamp column is an unknown boundary.
    decodeInstant: (value: unknown) => Schema.decodeUnknownSync(Schema.Date)(value).getTime(),
    engineNowMillis: sql`floor(extract(epoch from clock_timestamp()) * 1000)`,
    toMillis: (expression: ReturnType<typeof sql>) =>
      sql`floor(extract(epoch from ${expression}) * 1000)`,
    fromMillis: (expression: ReturnType<typeof sql>) => sql`to_timestamp((${expression}) / 1000.0)`,
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
    mutations: [],
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
        organization: registration.organization,
        totpEnabled: false,
        joinedAt: new Date(),
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
