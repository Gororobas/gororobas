import { type PhoneOtp, Proofs, Schema as AuthSchema, type Sessions } from "@yielded/auth";
import {
  PersistenceMappingError,
  requiredProofConstraints,
  type ProofPersistenceMapping,
  phoneProofCompletionMapping,
  requiredPhoneConstraints,
  type PhoneMapping,
} from "@yielded/auth-persistence-drizzle";
import { sql } from "drizzle-orm";
import { integer, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";
import { Effect, Schema } from "effect";
import * as SqlClient from "effect/sql/SqlClient";

export const customer = sqliteTable("phone_customer", {
  customerNo: integer().primaryKey(),
  enabled: integer({ mode: "boolean" }).notNull(),
  security: text().notNull(),
  segment: text().notNull(),
  locale: text().notNull(),
});

export const identifier = sqliteTable(
  "phone_identifier",
  {
    namespace: text().notNull(),
    value: text().notNull(),
    customerNo: integer().notNull(),
    custody: text().notNull(),
    verifiedAt: text(),
    enabled: integer({ mode: "boolean" }).notNull(),
  },
  (t) => [uniqueIndex("phone_identifier_unique").on(t.namespace, t.value)],
);

export const credential = sqliteTable("phone_factor", {
  key: text().primaryKey(),
  customerNo: integer().notNull(),
  revision: text().notNull(),
  enabled: integer({ mode: "boolean" }).notNull(),
});

export const state = sqliteTable("phone_state", {
  scope: text().primaryKey(),
  payload: text().notNull(),
  version: text().notNull(),
});

export const request = sqliteTable(
  "phone_proof_request",
  {
    moduleId: text().notNull(),
    requestId: text().notNull(),
    fingerprint: text().notNull(),
    proofId: text().notNull(),
    purpose: text().notNull(),
    keyId: text().notNull(),
    createdAt: text().notNull(),
    retentionUntil: text().notNull(),
    receipt: text().notNull(),
  },
  (t) => [uniqueIndex("phone_request_unique").on(t.moduleId, t.requestId)],
);

export const series = sqliteTable(
  "phone_proof_series",
  {
    moduleId: text().notNull(),
    purpose: text().notNull(),
    scopeKey: text().notNull(),
    activeProofId: text(),
    lastIssueAt: text(),
    version: text().notNull(),
  },
  (t) => [uniqueIndex("phone_series_unique").on(t.moduleId, t.purpose, t.scopeKey)],
);

export const generation = sqliteTable(
  "phone_proof_generation",
  {
    moduleId: text().notNull(),
    purpose: text().notNull(),
    proofId: text().notNull(),
    requestId: text().notNull(),
    seriesKey: text().notNull(),
    deliveryId: text().notNull(),
    binding: text().notNull(),
    verifierKeyId: text().notNull(),
    verifierDigest: text().notNull(),
    issuedAt: text().notNull(),
    expiresAt: text().notNull(),
    version: text().notNull(),
    state: text().notNull(),
    sendCount: integer().notNull(),
    deliveryState: text().notNull(),
    claimVersion: text(),
    claimDeadline: text(),
    retryAt: text(),
    deliveryRetryMillis: integer().notNull(),
    retentionUntil: text().notNull(),
    fingerprint: text().notNull(),
  },
  (t) => [
    uniqueIndex("phone_generation_unique").on(t.moduleId, t.proofId),
    uniqueIndex("phone_delivery_unique").on(t.moduleId, t.deliveryId),
  ],
);

export const continuation = sqliteTable(
  "phone_proof_continuation",
  {
    moduleId: text().notNull(),
    purpose: text().notNull(),
    continuationId: text().notNull(),
    digest: text().notNull(),
    proofId: text().notNull(),
    seriesKey: text().notNull(),
    binding: text().notNull(),
    expiresAt: text().notNull(),
    consumed: integer({ mode: "boolean" }).notNull(),
    version: text().notNull(),
    retentionUntil: text().notNull(),
  },
  (t) => [
    uniqueIndex("phone_continuation_unique").on(t.moduleId, t.continuationId),
    uniqueIndex("phone_continuation_digest").on(t.moduleId, t.digest),
  ],
);

export const rate = sqliteTable(
  "phone_proof_rate",
  {
    moduleId: text().notNull(),
    purpose: text().notNull(),
    action: text().notNull(),
    scopeKind: text().notNull(),
    scopeKey: text().notNull(),
  },
  (t) => [
    uniqueIndex("phone_rate_unique").on(t.moduleId, t.purpose, t.action, t.scopeKind, t.scopeKey),
  ],
);

export const abuse = sqliteTable(
  "phone_proof_abuse",
  {
    moduleId: text().notNull(),
    purpose: text().notNull(),
    action: text().notNull(),
    scopeKind: text().notNull(),
    scopeKey: text().notNull(),
    commandId: text().notNull(),
    occurredAt: text().notNull(),
    retentionUntil: text().notNull(),
  },
  (t) => [
    uniqueIndex("phone_abuse_unique").on(
      t.moduleId,
      t.action,
      t.scopeKind,
      t.scopeKey,
      t.commandId,
    ),
  ],
);

export const failure = sqliteTable(
  "phone_proof_failure",
  {
    moduleId: text().notNull(),
    purpose: text().notNull(),
    seriesKey: text().notNull(),
    commandId: text().notNull(),
    occurredAt: text().notNull(),
    retentionUntil: text().notNull(),
  },
  (t) => [uniqueIndex("phone_failure_unique").on(t.moduleId, t.seriesKey, t.commandId)],
);

export const command = sqliteTable(
  "phone_proof_command",
  {
    moduleId: text().notNull(),
    commandId: text().notNull(),
    kind: text().notNull(),
    decision: text().notNull(),
    retentionUntil: text().notNull(),
  },
  (t) => [uniqueIndex("phone_command_unique").on(t.moduleId, t.commandId)],
);

export const encodeInstant = (millis: number) => new Date(millis).toISOString();

export const decodeInstant = (value: unknown) =>
  typeof value === "string" && Number.isFinite(Date.parse(value))
    ? Effect.succeed(Date.parse(value))
    : Effect.fail(
        PersistenceMappingError.make({
          operation: "phone-example-codec",
          cause: "invalid consumer value",
        }),
      );

export const nativeSubject = (id: AuthSchema.SubjectId) => {
  if (!/^customer:[1-9][0-9]*$/.test(id))
    throw PersistenceMappingError.make({
      operation: "phone-example-codec",
      cause: "invalid consumer value",
    });
  const result = Number(id.slice(9));

  if (!Number.isSafeInteger(result))
    throw PersistenceMappingError.make({
      operation: "phone-example-codec",
      cause: "invalid consumer value",
    });

  return result;
};

export const subjectId = {
  toNative: (id: AuthSchema.SubjectId) =>
    Effect.try({
      try: () => nativeSubject(id),
      catch: () =>
        PersistenceMappingError.make({
          operation: "phone-example-codec",
          cause: "invalid consumer value",
        }),
    }),
  toSubject: (id: number) => Effect.succeed(AuthSchema.SubjectId.make(`customer:${id}`)),
  equals: (a: number, b: number) => a === b,
};

const bindingCodec = Schema.fromJsonString(Proofs.ProofBinding),
  receiptCodec = Schema.fromJsonString(Proofs.ProofRequestReceipt);

const decodeBinding = (value: string) =>
  Schema.decodeEffect(bindingCodec)(value).pipe(
    Effect.mapError(() =>
      PersistenceMappingError.make({
        operation: "phone-example-codec",
        cause: "invalid consumer value",
      }),
    ),
  );

export const requirement: Sessions.AuthenticationRequirement = {
  maximumAgeMillis: 300_000,
  alternatives: [
    {
      factors: ["possession"],
      minimumCredentials: 1,
      userVerified: false,
      phishingResistant: false,
    },
  ],
};

export const engineNowMillis = sql`cast(round((julianday('now') - 2440587.5) * 86400000) as integer)`;

const clock = {
  engineNow: sql`strftime('%Y-%m-%dT%H:%M:%fZ','now')`,
  engineNowMillis,
  engineInstantMinus: (millis: number) =>
    sql`strftime('%Y-%m-%dT%H:%M:%fZ','now',${`-${millis / 1000} seconds`})`,
  engineInstantPlus: (millis: number) =>
    sql`strftime('%Y-%m-%dT%H:%M:%fZ','now',${`+${millis / 1000} seconds`})`,
};

export const proofs: ProofPersistenceMapping<
  typeof request,
  typeof series,
  typeof generation,
  typeof continuation,
  typeof rate,
  typeof abuse,
  typeof failure,
  typeof command,
  typeof customer,
  typeof identifier,
  typeof credential,
  number
> = {
  constraints: requiredProofConstraints,
  encodeInstant,
  decodeInstant,
  allocateVersionSync: () => Proofs.ProofVersion.make(crypto.randomUUID()),
  d1: clock,
  isRequestConflict: () => false,
  isSeriesConflict: () => false,
  isCommandConflict: () => false,
  scopeKeys: ({ binding }) => ({
    series: Schema.encodeSync(Schema.fromJsonString(Schema.Array(Schema.String)))([
      binding.identifier.namespace,
      binding.identifier.value,
      binding._tag === "Identifier" ? "anonymous" : binding.revision.subjectId,
    ]),
    identifier: Schema.encodeSync(Schema.fromJsonString(Schema.Array(Schema.String)))([
      binding.identifier.namespace,
      binding.identifier.value,
    ]),
    subject: binding._tag === "Identifier" ? "anonymous" : binding.revision.subjectId,
  }),
  authority: {
    subjectId,
    subject: {
      table: customer,
      id: "customerNo",
      status: "enabled",
      securityRevision: "security",
      isActiveStatus: (v) => v === true,
      d1ActiveStatusValue: true,
    },
    credential: {
      table: credential,
      subjectId: "customerNo",
      credentialId: "key",
      revision: "revision",
      status: "enabled",
      isActiveStatus: (v) => v === true,
      d1ActiveStatusValue: true,
    },
    identifier: {
      table: identifier,
      namespace: "namespace",
      value: "value",
      isCurrent: (input, rows) =>
        input.binding._tag === "Identifier"
          ? rows.length === 0
          : input.binding._tag === "IdentifierChange"
            ? rows.length === 0
            : rows.length === 0 ||
              rows.every((r) => r.customerNo === input.nativeSubjectId && r.enabled),
      d1CurrentCondition: (input) =>
        input.binding._tag === "Identifier" || input.binding._tag === "IdentifierChange"
          ? sql`not exists(select 1 from ${identifier} where ${identifier.namespace}=${input.binding.identifier.namespace} and ${identifier.value}=${input.binding.identifier.value})`
          : sql`not exists(select 1 from ${identifier} where ${identifier.namespace}=${input.binding.identifier.namespace} and ${identifier.value}=${input.binding.identifier.value} and (${identifier.customerNo}<>${input.nativeSubjectId} or ${identifier.enabled}=0))`,
    },
  },
  request: {
    table: request,
    moduleId: "moduleId",
    requestId: "requestId",
    fingerprint: "fingerprint",
    proofId: "proofId",
    purpose: "purpose",
    keyId: "keyId",
    createdAt: "createdAt",
    retentionUntil: "retentionUntil",
    encodeInsert: (input) => ({
      moduleId: input.record.moduleId,
      requestId: input.record.requestId,
      fingerprint: input.record.fingerprint,
      proofId: input.record.proofId,
      purpose: input.record.purpose,
      keyId: input.record.verifier.keyId,
      createdAt: encodeInstant(input.record.issuedAtMillis),
      retentionUntil: encodeInstant(input.retentionUntilMillis),
      receipt: Schema.encodeSync(receiptCodec)({
        requestId: input.record.requestId,
        reference: {
          proofId: input.record.proofId,
          purpose: input.record.purpose,
          keyId: input.record.verifier.keyId,
        },
      }),
    }),
    decodeReceipt: (row) =>
      Schema.decodeEffect(receiptCodec)(row.receipt).pipe(
        Effect.mapError(() =>
          PersistenceMappingError.make({
            operation: "phone-example-codec",
            cause: "invalid consumer value",
          }),
        ),
      ),
  },
  series: {
    table: series,
    moduleId: "moduleId",
    purpose: "purpose",
    scopeKey: "scopeKey",
    activeProofId: "activeProofId",
    lastIssueAt: "lastIssueAt",
    version: "version",
    encodeInsert: (input) => ({ ...input, activeProofId: null, lastIssueAt: null }),
  },
  generation: {
    table: generation,
    moduleId: "moduleId",
    purpose: "purpose",
    proofId: "proofId",
    requestId: "requestId",
    seriesKey: "seriesKey",
    deliveryId: "deliveryId",
    binding: "binding",
    verifierKeyId: "verifierKeyId",
    verifierDigest: "verifierDigest",
    issuedAt: "issuedAt",
    expiresAt: "expiresAt",
    version: "version",
    state: "state",
    sendCount: "sendCount",
    deliveryState: "deliveryState",
    claimVersion: "claimVersion",
    claimDeadline: "claimDeadline",
    retryAt: "retryAt",
    deliveryRetryMillis: "deliveryRetryMillis",
    retentionUntil: "retentionUntil",
    encodeInsert: ({ record, seriesKey, retentionUntilMillis, state, deliveryState, policy }) => ({
      moduleId: record.moduleId,
      purpose: record.purpose,
      proofId: record.proofId,
      requestId: record.requestId,
      seriesKey,
      deliveryId: record.deliveryId,
      binding: Schema.encodeSync(bindingCodec)(record.binding),
      verifierKeyId: record.verifier.keyId,
      verifierDigest: record.verifier.digest,
      issuedAt: encodeInstant(record.issuedAtMillis),
      expiresAt: encodeInstant(record.expiresAtMillis),
      version: record.version,
      state,
      sendCount: 0,
      deliveryState,
      claimVersion: null,
      claimDeadline: null,
      retryAt: null,
      deliveryRetryMillis: policy.deliveryRetryMillis,
      retentionUntil: encodeInstant(retentionUntilMillis),
      fingerprint: record.fingerprint,
    }),
    decodeBinding: (row) => decodeBinding(row.binding),
    decodeRecord: (row) =>
      Effect.gen(function* () {
        return {
          moduleId: row.moduleId,
          purpose: Proofs.ProofPurpose.make(row.purpose),
          proofId: Proofs.ProofId.make(row.proofId),
          requestId: Proofs.ProofRequestId.make(row.requestId),
          fingerprint: AuthSchema.TokenDigest.make(row.fingerprint),
          deliveryId: Proofs.ProofDeliveryId.make(row.deliveryId),
          binding: yield* decodeBinding(row.binding),
          verifier: {
            keyId: row.verifierKeyId,
            digest: AuthSchema.TokenDigest.make(row.verifierDigest),
          },
          issuedAtMillis: yield* decodeInstant(row.issuedAt),
          expiresAtMillis: yield* decodeInstant(row.expiresAt),
          version: Proofs.ProofVersion.make(row.version),
        };
      }),
  },
  continuation: {
    table: continuation,
    moduleId: "moduleId",
    purpose: "purpose",
    continuationId: "continuationId",
    digest: "digest",
    proofId: "proofId",
    seriesKey: "seriesKey",
    binding: "binding",
    expiresAt: "expiresAt",
    consumed: "consumed",
    version: "version",
    retentionUntil: "retentionUntil",
    encodeInsert: (record) => ({
      ...record,
      binding: Schema.encodeSync(bindingCodec)(record.binding),
      expiresAt: encodeInstant(record.expiresAtMillis),
      consumed: false,
      retentionUntil: encodeInstant(record.retentionUntilMillis),
    }),
    decode: (row) =>
      Effect.gen(function* () {
        return {
          moduleId: row.moduleId,
          purpose: Proofs.ProofPurpose.make(row.purpose),
          continuationId: Proofs.ProofContinuationId.make(row.continuationId),
          digest: AuthSchema.TokenDigest.make(row.digest),
          proofId: Proofs.ProofId.make(row.proofId),
          seriesKey: row.seriesKey,
          binding: yield* decodeBinding(row.binding),
          expiresAtMillis: yield* decodeInstant(row.expiresAt),
          version: Proofs.ProofVersion.make(row.version),
        };
      }),
  },
  rateScope: {
    table: rate,
    moduleId: "moduleId",
    purpose: "purpose",
    action: "action",
    scopeKind: "scopeKind",
    scopeKey: "scopeKey",
    encodeInsert: (input) => ({ ...input }),
  },
  abuseEvent: {
    table: abuse,
    moduleId: "moduleId",
    purpose: "purpose",
    action: "action",
    scopeKind: "scopeKind",
    scopeKey: "scopeKey",
    commandId: "commandId",
    occurredAt: "occurredAt",
    retentionUntil: "retentionUntil",
    encodeInsert: (input) => ({
      ...input,
      occurredAt: encodeInstant(input.occurredAtMillis),
      retentionUntil: encodeInstant(input.retentionUntilMillis),
    }),
  },
  failureEvent: {
    table: failure,
    moduleId: "moduleId",
    purpose: "purpose",
    seriesKey: "seriesKey",
    commandId: "commandId",
    occurredAt: "occurredAt",
    retentionUntil: "retentionUntil",
    encodeInsert: (input) => ({
      ...input,
      occurredAt: encodeInstant(input.occurredAtMillis),
      retentionUntil: encodeInstant(input.retentionUntilMillis),
    }),
  },
  command: {
    table: command,
    moduleId: "moduleId",
    commandId: "commandId",
    kind: "kind",
    decision: "decision",
    retentionUntil: "retentionUntil",
    encodeInsert: (input) => ({
      ...input,
      retentionUntil: encodeInstant(input.retentionUntilMillis),
    }),
  },
};

export const lifecyclePolicy: PhoneOtp.PhoneLifecyclePolicy = {
  maximumEvidenceAgeMillis: 60_000,
  requireImmediateInvalidation: false,
};

export const admissionPolicy: PhoneOtp.PhoneAdmissionPolicy = {
  windowMillis: 60_000,
  networkRequests: 30,
  networkAttempts: 100,
  maximumMessages: 100,
  requestRetentionMillis: 3_600_000,
};

export const mapping: PhoneMapping<
  typeof customer,
  typeof identifier,
  typeof credential,
  typeof state,
  number
> = {
  moduleId: "shop/phone",
  policy: lifecyclePolicy,
  admission: admissionPolicy,
  constraints: requiredPhoneConstraints,
  proofs: phoneProofCompletionMapping(proofs),
  engineNowMillis,
  encodeInstant,
  subjectIds: {
    toNative: nativeSubject,
    toSubject: (id) => AuthSchema.SubjectId.make(`customer:${id}`),
    allocate: () => 1 + crypto.getRandomValues(new Uint32Array(1))[0]!,
  },
  subject: {
    table: customer,
    id: "customerNo",
    securityRevision: "security",
    activeCondition: sql`${customer.enabled}=1`,
    decodeRequirement: () => requirement,
    encodeInsert: (input) => ({
      customerNo: input.id,
      enabled: true,
      security: input.securityRevision,
      segment: "retail",
      locale: "en-ZA",
    }),
  },
  identifier: {
    table: identifier,
    namespace: "namespace",
    value: "value",
    subjectId: "customerNo",
    revision: "custody",
    verifiedAt: "verifiedAt",
    status: "enabled",
    activeCondition: sql`${identifier.enabled}=1`,
    encodeStatus: (active) => active,
    encodeInsert: (input) => ({
      namespace: "phone",
      value: input.phoneNumber,
      customerNo: input.subjectId,
      custody: input.revision,
      verifiedAt: encodeInstant(input.verifiedAtMillis),
      enabled: input.active,
    }),
  },
  credential: {
    table: credential,
    id: "key",
    subjectId: "customerNo",
    revision: "revision",
    status: "enabled",
    activeCondition: sql`${credential.enabled}=1`,
    encodeStatus: (active) => active,
    encodeInsert: (input) => ({
      key: input.credentialId,
      customerNo: input.subjectId,
      revision: input.revision,
      enabled: input.active,
    }),
  },
  state: {
    table: state,
    scope: "scope",
    state: "payload",
    version: "version",
    encodeInsert: (input) => ({ scope: input.scope, payload: input.state, version: input.version }),
  },
};

/** The consumer owns these migrations. No session table exists in this application. */
export const migrate = Effect.gen(function* () {
  const client = yield* SqlClient.SqlClient;

  for (const statement of [
    "create table phone_customer(customerNo integer primary key, enabled integer not null, security text not null,segment text not null,locale text not null)",
    "create table phone_identifier(namespace text not null,value text not null,customerNo integer not null,custody text not null,verifiedAt text,enabled integer not null,unique(namespace,value))",
    "create table phone_factor(key text primary key,customerNo integer not null,revision text not null,enabled integer not null)",
    "create table phone_state(scope text primary key,payload text not null,version text not null)",
    "create table phone_proof_request(moduleId text not null,requestId text not null,fingerprint text not null,proofId text not null,purpose text not null,keyId text not null,createdAt text not null,retentionUntil text not null,receipt text not null,unique(moduleId,requestId))",
    "create table phone_proof_series(moduleId text not null,purpose text not null,scopeKey text not null,activeProofId text,lastIssueAt text,version text not null,unique(moduleId,purpose,scopeKey))",
    "create table phone_proof_generation(moduleId text not null,purpose text not null,proofId text not null,requestId text not null,seriesKey text not null,deliveryId text not null,binding text not null,verifierKeyId text not null,verifierDigest text not null,issuedAt text not null,expiresAt text not null,version text not null,state text not null,sendCount integer not null,deliveryState text not null,claimVersion text,claimDeadline text,retryAt text,deliveryRetryMillis integer not null,retentionUntil text not null,fingerprint text not null,unique(moduleId,proofId),unique(moduleId,deliveryId))",
    "create table phone_proof_continuation(moduleId text not null,purpose text not null,continuationId text not null,digest text not null,proofId text not null,seriesKey text not null,binding text not null,expiresAt text not null,consumed integer not null,version text not null,retentionUntil text not null,unique(moduleId,continuationId),unique(moduleId,digest))",
    "create table phone_proof_rate(moduleId text not null,purpose text not null,action text not null,scopeKind text not null,scopeKey text not null,unique(moduleId,purpose,action,scopeKind,scopeKey))",
    "create table phone_proof_abuse(moduleId text not null,purpose text not null,action text not null,scopeKind text not null,scopeKey text not null,commandId text not null,occurredAt text not null,retentionUntil text not null,unique(moduleId,action,scopeKind,scopeKey,commandId))",
    "create table phone_proof_failure(moduleId text not null,purpose text not null,seriesKey text not null,commandId text not null,occurredAt text not null,retentionUntil text not null,unique(moduleId,seriesKey,commandId))",
    "create table phone_proof_command(moduleId text not null,commandId text not null,kind text not null,decision text not null,retentionUntil text not null,unique(moduleId,commandId))",
  ])
    yield* client.unsafe(statement);
});
