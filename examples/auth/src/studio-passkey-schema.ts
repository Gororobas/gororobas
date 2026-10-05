import { Passkey, Schema as AuthSchema } from "@yielded/auth";
import {
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
import { bigint, boolean, pgTable, text, timestamp, uuid, uniqueIndex } from "drizzle-orm/pg-core";
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
  handleKey: text().notNull(),
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
  maximumCounter: bigint({ mode: "number" }).notNull(),
  name: text().notNull(),
  createdAt: timestamp({ withTimezone: true, mode: "date" }).notNull(),
  lastUsedAt: timestamp({ withTimezone: true, mode: "date" }),
});

export const ownership = pgTable("studio_passkey_ownership", {
  credentialKey: text().primaryKey(),
  rpId: text().notNull(),
  protocolCredentialId: text().notNull(),
  subjectId: uuid(),
  credentialId: text(),
  state: text().notNull(),
  version: text().notNull(),
  reservationId: text(),
});

export const handle = pgTable(
  "studio_passkey_handle",
  {
    handleKey: text().primaryKey(),
    rpId: text().notNull(),
    userHandle: text().notNull(),
    subjectId: uuid(),
    state: text().notNull(),
    version: text().notNull(),
    reservationId: text(),
  },
  (t) => [uniqueIndex("studio_passkey_bound_handle").on(t.rpId, t.subjectId)],
);

export const module = pgTable("studio_passkey_module", {
  moduleId: text().primaryKey(),
  status: text().notNull(),
  policyRevision: text().notNull(),
  policy: text().notNull(),
});

export const flow = pgTable("studio_passkey_flow", {
  moduleId: text().notNull(),
  flowId: text().primaryKey(),
  commandId: text().notNull().unique(),
  purpose: text().notNull(),
  state: text().notNull(),
  version: text().notNull(),
  generation: bigint({ mode: "number" }).notNull(),
  snapshot: text().notNull(),
  policySnapshot: text().notNull(),
  requestBindingVerifier: text().notNull(),
  requestBindingExpiresAt: timestamp({ withTimezone: true, mode: "date" }).notNull(),
  issuedAt: timestamp({ withTimezone: true, mode: "date" }).notNull(),
  expiresAt: timestamp({ withTimezone: true, mode: "date" }).notNull(),
  retentionUntil: timestamp({ withTimezone: true, mode: "date" }).notNull(),
  claimId: text(),
  claimedAt: timestamp({ withTimezone: true, mode: "date" }),
  claimExpiresAt: timestamp({ withTimezone: true, mode: "date" }),
  credentialSnapshot: text(),
  subjectScope: text(),
  targetScope: text(),
});

export const admission = pgTable("studio_passkey_admission", {
  authorityScope: text().notNull(),
  moduleId: text().primaryKey(),
  version: text().notNull(),
  ownerMarker: text().notNull(),
  admittedAt: timestamp({ withTimezone: true, mode: "date" }),
});

export const charge = pgTable(
  "studio_passkey_charge",
  {
    moduleId: text().notNull(),
    flowId: text().notNull(),
    purpose: text().notNull(),
    kind: text().notNull(),
    scope: text().notNull(),
    originalWindowMillis: bigint({ mode: "number" }).notNull(),
    admittedAt: timestamp({ withTimezone: true, mode: "date" }),
    retainUntil: timestamp({ withTimezone: true, mode: "date" }),
    version: text().notNull(),
    ownerMarker: text().notNull(),
  },
  (t) => [uniqueIndex("studio_passkey_charge_key").on(t.moduleId, t.flowId, t.kind)],
);

export const intent = pgTable("studio_passkey_intent", {
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

export const command = pgTable("studio_passkey_command", {
  moduleId: text().notNull(),
  commandId: text().primaryKey(),
  subjectId: uuid().notNull(),
  credentialId: text().notNull(),
  intent: text().notNull(),
  decision: text().notNull(),
  retentionUntil: timestamp({ withTimezone: true, mode: "date" }).notNull(),
  version: text().notNull(),
});

export { registrationSchema, profile, policy, management, requirement } from "./studio-models";
import { registrationSchema, management, requirement } from "./studio-models";
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
} satisfies PasskeyWriteTables<
  typeof subject,
  typeof credential,
  typeof factor,
  typeof ownership,
  typeof handle,
  string
>;

export const base = {
  moduleId: "studio/passkey",
  authorityScope: "studio",
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
      requestBindingExpiresAt: new Date(0),
      issuedAt: new Date(0),
      expiresAt: new Date(0),
      retentionUntil: new Date(0),
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
    encodeInstant: (millis: number) => new Date(millis),
    // oxlint-disable-next-line no-restricted-properties -- the native driver timestamp column is an unknown boundary.
    decodeInstant: (value: unknown) => Schema.decodeUnknownSync(Schema.Date)(value).getTime(),
    engineNowMillis: sql`floor(extract(epoch from clock_timestamp()) * 1000)`,
    toMillis: (expression: ReturnType<typeof sql>) =>
      sql`floor(extract(epoch from ${expression}) * 1000)`,
    fromMillis: (expression: ReturnType<typeof sql>) => sql`to_timestamp((${expression}) / 1000.0)`,
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
      retentionUntil: new Date(0),
      version: "",
    }),
  },
  managementConstraints: requiredPasskeyManagementConstraints,
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
        organization: registration.organization,
        totpEnabled: false,
        joinedAt: new Date(),
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
