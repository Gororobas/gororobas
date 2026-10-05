import { Passkey, Schema as AuthSchema } from "@yielded/auth";
import {
  passkeyInvalidationMutation,
  requiredPasskeyCredentialConstraints,
  requiredPasskeyManagementConstraints,
  requiredPasskeyPersistenceConstraints,
  requiredPasskeyRegistrationWriteConstraints,
  type PasskeyCredentialMapping,
  type PasskeyManagementMapping,
  type PasskeyRegistrationMapping,
  type PasskeyWriteTables,
} from "@yielded/auth-persistence-drizzle";
import { sql } from "drizzle-orm";
import { integer, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";
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
  handleKey: text().notNull(),
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
  maximumCounter: integer().notNull(),
  name: text().notNull(),
  createdAt: integer().notNull(),
  lastUsedAt: integer(),
});

export const ownership = sqliteTable("passkey_ownership", {
  credentialKey: text().primaryKey(),
  rpId: text().notNull(),
  protocolCredentialId: text().notNull(),
  subjectId: text(),
  credentialId: text(),
  state: text().notNull(),
  version: text().notNull(),
  reservationId: text(),
});

export const handle = sqliteTable(
  "passkey_handle",
  {
    handleKey: text().primaryKey(),
    rpId: text().notNull(),
    userHandle: text().notNull(),
    subjectId: text(),
    state: text().notNull(),
    version: text().notNull(),
    reservationId: text(),
  },
  (t) => [uniqueIndex("passkey_bound_handle").on(t.rpId, t.subjectId)],
);

export const module = sqliteTable("passkey_module", {
  moduleId: text().primaryKey(),
  status: text().notNull(),
  policyRevision: text().notNull(),
  policy: text().notNull(),
});

export const flow = sqliteTable("passkey_flow", {
  moduleId: text().notNull(),
  flowId: text().primaryKey(),
  commandId: text().notNull().unique(),
  purpose: text().notNull(),
  state: text().notNull(),
  version: text().notNull(),
  generation: integer().notNull(),
  snapshot: text().notNull(),
  policySnapshot: text().notNull(),
  requestBindingVerifier: text().notNull(),
  requestBindingExpiresAt: integer().notNull(),
  issuedAt: integer().notNull(),
  expiresAt: integer().notNull(),
  retentionUntil: integer().notNull(),
  claimId: text(),
  claimedAt: integer(),
  claimExpiresAt: integer(),
  credentialSnapshot: text(),
  subjectScope: text(),
  targetScope: text(),
});

export const admission = sqliteTable("passkey_admission", {
  authorityScope: text().notNull(),
  moduleId: text().primaryKey(),
  version: text().notNull(),
  ownerMarker: text().notNull(),
  admittedAt: integer(),
});

export const charge = sqliteTable(
  "passkey_charge",
  {
    moduleId: text().notNull(),
    flowId: text().notNull(),
    purpose: text().notNull(),
    kind: text().notNull(),
    scope: text().notNull(),
    originalWindowMillis: integer().notNull(),
    admittedAt: integer(),
    retainUntil: integer(),
    version: text().notNull(),
    ownerMarker: text().notNull(),
  },
  (t) => [uniqueIndex("passkey_charge_key").on(t.moduleId, t.flowId, t.kind)],
);

export const intent = sqliteTable("passkey_intent", {
  moduleId: text().notNull(),
  flowId: text().primaryKey(),
  commandId: text().notNull().unique(),
  state: text().notNull(),
  version: text().notNull(),
  fingerprint: text().notNull(),
  handleKey: text().notNull(),
  reservationId: text().notNull(),
  ceremonySnapshot: text().notNull(),
  applicationSnapshot: text().notNull(),
});

export const command = sqliteTable("passkey_command", {
  moduleId: text().notNull(),
  commandId: text().primaryKey(),
  subjectId: text().notNull(),
  credentialId: text().notNull(),
  intent: text().notNull(),
  decision: text().notNull(),
  retentionUntil: integer().notNull(),
  version: text().notNull(),
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
  generation: 1,
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
  generation: 1,
  profiles: [profile],
  lifetimeMillis: 120000,
  claimLifetimeMillis: 60000,
  retentionMillis: 86400000,
  maximumPending: 100,
  maximumPendingPerSubject: 10,
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
const policyCodec = Schema.fromJsonString(Passkey.PasskeyMethodPolicy);
const active = (value: unknown) => value === "active";

export const read = {
  subject: {
    table: subject,
    id: "id",
    status: "status",
    securityRevision: "securityRevision",
    decodeId: (row) => row.id!,
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
    handleKey: "handleKey",
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
    maximumCounter: "maximumCounter",
    decode: (row) =>
      // oxlint-disable-next-line no-restricted-properties -- the partial native database row is decoded at the storage boundary.
      Schema.decodeUnknownSync(
        Passkey.PasskeyCredential.mapFields(
          ({ revision: _revision, active: _active, ...fields }) => fields,
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
  credentialOwnership: {
    table: ownership,
    credentialKey: "credentialKey",
    rpId: "rpId",
    protocolCredentialId: "protocolCredentialId",
    subjectId: "subjectId",
    credentialId: "credentialId",
    state: "state",
    version: "version",
    reservationId: "reservationId",
    ownedCondition: sql`${ownership.state} = 'owned'`,
    isOwnedState: (value) => value === "owned",
    decodeSubjectId: (row) => row.subjectId!,
  },
  handleOwnership: {
    table: handle,
    handleKey: "handleKey",
    rpId: "rpId",
    userHandle: "userHandle",
    subjectId: "subjectId",
    state: "state",
    version: "version",
    reservationId: "reservationId",
    ownedCondition: sql`${handle.state} = 'owned'`,
    isOwnedState: (value) => value === "owned",
    decodeSubjectId: (row) => row.subjectId!,
  },
  subjectIds: {
    toNative: (id: AuthSchema.SubjectId) => String(id),
    toSubject: AuthSchema.SubjectId.make,
    equals: (left: string, right: string) => left === right,
  },
  constraints: requiredPasskeyCredentialConstraints,
} satisfies PasskeyCredentialMapping<
  typeof subject,
  typeof credential,
  typeof factor,
  typeof ownership,
  typeof handle,
  string
>;

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
      maximumCounter: input.credential.maximumCounter,
      subjectId: input.subjectId,
      profile: Schema.encodeSync(profileCodec)(input.credential.profile),
      publicKey: input.credential.publicKey,
      credentialRevision: input.marker,
      credentialKey: "",
      handleKey: "",
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
  credentialOwnership: {
    encodeInsert: (input) => ({
      credentialKey: "",
      rpId: input.credential.rpId,
      protocolCredentialId: input.credential.protocolCredentialId,
      state: "owned",
      version: input.marker,
    }),
    ownedState: "owned",
    removedState: "removed",
  },
  handleOwnership: {
    encodeInsert: (input) => ({
      subjectId: input.subjectId,
      rpId: input.rpId,
      userHandle: input.userHandle,
      handleKey: "",
      state: "owned",
      version: input.marker,
    }),
    ownedState: "owned",
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
} satisfies PasskeyWriteTables<
  typeof subject,
  typeof credential,
  typeof factor,
  typeof ownership,
  typeof handle,
  string
>;

export const base = {
  moduleId: "example-passkey",
  authorityScope: "example",
  read,
  module: {
    table: module,
    moduleId: "moduleId",
    status: "status",
    policyRevision: "policyRevision",
    policyColumns: ["policy"],
    isActiveStatus: active,
    activeCondition: sql`${module.status} = 'active'`,
    decodeMethodPolicy: (row: Partial<typeof module.$inferSelect>) =>
      Schema.decodeSync(policyCodec)(row.policy!),
  },
  flow: {
    table: flow,
    moduleId: "moduleId",
    flowId: "flowId",
    commandId: "commandId",
    purpose: "purpose",
    state: "state",
    version: "version",
    generation: "generation",
    snapshot: "snapshot",
    policySnapshot: "policySnapshot",
    requestBindingVerifier: "requestBindingVerifier",
    requestBindingExpiresAt: "requestBindingExpiresAt",
    issuedAt: "issuedAt",
    expiresAt: "expiresAt",
    retentionUntil: "retentionUntil",
    claimId: "claimId",
    claimedAt: "claimedAt",
    claimExpiresAt: "claimExpiresAt",
    credentialSnapshot: "credentialSnapshot",
    subjectScope: "subjectScope",
    targetScope: "targetScope",
    states: {
      Pending: "Pending",
      Claimed: "Claimed",
      Verified: "Verified",
      Rejected: "Rejected",
      Ambiguous: "Ambiguous",
      RegistrationAccepted: "RegistrationAccepted",
      ProvisioningPending: "ProvisioningPending",
    },
    encodeInsert: () => ({
      moduleId: "",
      flowId: "",
      commandId: "",
      purpose: "",
      state: "",
      version: "",
      generation: 1,
      snapshot: "",
      policySnapshot: "",
      requestBindingVerifier: "",
      requestBindingExpiresAt: 0,
      issuedAt: 0,
      expiresAt: 0,
      retentionUntil: 0,
    }),
  },
  admission: {
    table: admission,
    authorityScope: "authorityScope",
    moduleId: "moduleId",
    version: "version",
    ownerMarker: "ownerMarker",
    admittedAt: "admittedAt",
  },
  charge: {
    table: charge,
    moduleId: "moduleId",
    flowId: "flowId",
    purpose: "purpose",
    kind: "kind",
    scope: "scope",
    originalWindowMillis: "originalWindowMillis",
    admittedAt: "admittedAt",
    retainUntil: "retainUntil",
    version: "version",
    ownerMarker: "ownerMarker",
    encodeInsert: () => ({
      moduleId: "",
      flowId: "",
      purpose: "",
      kind: "",
      scope: "",
      originalWindowMillis: 0,
      version: "",
      ownerMarker: "",
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
  telemetry: { lastUsedAt: "lastUsedAt", encodeBackupState: (value: boolean) => value },
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
  command: {
    table: command,
    moduleId: "moduleId",
    commandId: "commandId",
    subjectId: "subjectId",
    credentialId: "credentialId",
    intent: "intent",
    decision: "decision",
    retentionUntil: "retentionUntil",
    version: "version",
    encodeInsert: (input) => ({
      ...input,
      intent: "",
      decision: "",
      retentionUntil: 0,
      version: "",
    }),
  },
  managementConstraints: requiredPasskeyManagementConstraints,
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
  typeof ownership,
  typeof handle,
  typeof module,
  typeof flow,
  typeof admission,
  typeof charge,
  typeof command,
  string
>;

export const registrationMapping = {
  ...base,
  write,
  handle: {
    table: handle,
    handleKey: "handleKey",
    rpId: "rpId",
    userHandle: "userHandle",
    state: "state",
    version: "version",
    reservationId: "reservationId",
    reservedCondition: sql`${handle.state} = 'reserved'`,
    isReservedState: (value) => value === "reserved",
    reservedState: "reserved",
    encodeInsert: () => ({
      handleKey: "",
      rpId: "",
      userHandle: "",
      state: "reserved",
      version: "",
    }),
  },
  intent: {
    table: intent,
    moduleId: "moduleId",
    flowId: "flowId",
    commandId: "commandId",
    state: "state",
    version: "version",
    fingerprint: "fingerprint",
    handleKey: "handleKey",
    reservationId: "reservationId",
    ceremonySnapshot: "ceremonySnapshot",
    applicationSnapshot: "applicationSnapshot",
    pendingCondition: sql`${intent.state} = 'pending'`,
    isPendingState: (value) => value === "pending",
    custodyCondition: sql`${intent.state} = 'pending'`,
    pendingState: "pending",
    acceptedState: "accepted",
    rejectedState: "rejected",
    encodeInsert: () => ({
      moduleId: "",
      flowId: "",
      commandId: "",
      state: "pending",
      version: "",
      fingerprint: "",
      handleKey: "",
      reservationId: "",
      ceremonySnapshot: "",
      applicationSnapshot: "",
    }),
  },
  registration: {
    schema: registrationSchema,
    describe: (value) => ({ name: value.name, displayName: value.name }),
    eligible: (value) =>
      sql`not exists(select 1 from ${subject} where ${subject.id} = ${value.accountId})`,
    finalEligibility: ({ registration, subjectId }) =>
      sql`exists(select 1 from ${subject} where ${subject.id} = ${subjectId} and ${subject.name} = ${registration.name} and ${subject.status} = 'active')`,
    subject: ({ registration }) => ({
      subjectId: registration.accountId,
      values: {
        id: registration.accountId,
        status: "active",
        securityRevision: "",
        name: registration.name,
      },
    }),
    activeStatus: "active",
  },
  registrationConstraints: requiredPasskeyRegistrationWriteConstraints,
} satisfies PasskeyRegistrationMapping<
  typeof subject,
  typeof credential,
  typeof factor,
  typeof ownership,
  typeof handle,
  typeof module,
  typeof flow,
  typeof admission,
  typeof charge,
  typeof intent,
  string,
  typeof registrationSchema.Type
>;

/** The application owns these migrations and all identity/profile policy choices. */
export const migrate = Effect.gen(function* () {
  const client = yield* SqlClient.SqlClient;

  for (const ddl of migrations) yield* client.unsafe(ddl);
  yield* client.unsafe(
    "insert into passkey_module (moduleId,status,policyRevision,policy) values (?, ?, ?, ?)",
    [base.moduleId, "active", "1", Schema.encodeSync(policyCodec)(policy)],
  );
  yield* client.unsafe(
    "insert into passkey_admission (authorityScope,moduleId,version,ownerMarker) values (?, ?, ?, ?)",
    [base.authorityScope, base.moduleId, "initial", "initial"],
  );
});

export const migrations = [
  "create table passkey_subject (id text primary key, status text not null, securityRevision text not null, name text not null)",
  "create table passkey_factor (subjectId text not null, credentialId text primary key, revision text not null, status text not null)",
  "create table passkey_credential (credentialId text primary key, subjectId text not null, rpId text not null, protocolCredentialId text not null, credentialKey text not null unique, handleKey text not null, userHandle text not null, publicKey text not null, algorithm integer not null, profile text not null, credentialRevision text not null, status text not null, primarySignIn integer not null, enrollmentUserVerified integer not null, backupEligible integer not null, backupState integer not null, counter integer not null, maximumCounter integer not null, name text not null, createdAt integer not null, lastUsedAt integer)",
  "create table passkey_ownership (credentialKey text primary key, rpId text not null, protocolCredentialId text not null, subjectId text, credentialId text, state text not null, version text not null, reservationId text)",
  "create table passkey_handle (handleKey text primary key, rpId text not null, userHandle text not null, subjectId text, state text not null, version text not null, reservationId text, unique(rpId, subjectId))",
  "create table passkey_module (moduleId text primary key, status text not null, policyRevision text not null, policy text not null)",
  "create table passkey_flow (moduleId text not null, flowId text primary key, commandId text not null unique, purpose text not null, state text not null, version text not null, generation integer not null, snapshot text not null, policySnapshot text not null, requestBindingVerifier text not null, requestBindingExpiresAt integer not null, issuedAt integer not null, expiresAt integer not null, retentionUntil integer not null, claimId text, claimedAt integer, claimExpiresAt integer, credentialSnapshot text, subjectScope text, targetScope text)",
  "create table passkey_admission (authorityScope text not null, moduleId text primary key, version text not null, ownerMarker text not null, admittedAt integer)",
  "create table passkey_charge (moduleId text not null, flowId text not null, purpose text not null, kind text not null, scope text not null, originalWindowMillis integer not null, admittedAt integer, retainUntil integer, version text not null, ownerMarker text not null, unique(moduleId,flowId,kind))",
  "create table passkey_intent (moduleId text not null, flowId text primary key, commandId text not null unique, state text not null, version text not null, fingerprint text not null, handleKey text not null, reservationId text not null, ceremonySnapshot text not null, applicationSnapshot text not null)",
  "create table passkey_command (moduleId text not null, commandId text primary key, subjectId text not null, credentialId text not null, intent text not null, decision text not null, retentionUntil integer not null, version text not null)",
  "create table passkey_session (id text primary key, subjectId text not null, revision text not null, status text not null)",
  "create table passkey_pending (id text primary key, subjectId text not null, revision text not null, status text not null)",
] as const;
