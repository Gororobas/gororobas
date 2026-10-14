import { type PhoneOtp, Proofs, Schema as AuthSchema, type Sessions } from "@yielded/auth";
import {
  PersistenceMappingError,
  requiredProofConstraints,
  type ProofPersistenceMapping,
  requiredPhoneConstraints,
  type PhoneMapping,
} from "@yielded/auth-persistence-drizzle";
import { sql, type SQL } from "drizzle-orm";
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
    moduleId: text().notNull(),
    credentialId: text().notNull(),
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

export const proof = sqliteTable(
  "phone_proof",
  {
    moduleId: text().notNull(),
    purpose: text().notNull(),
    seriesKey: text().notNull(),
    proofId: text().notNull(),
    binding: text().notNull(),
    verifierKeyId: text().notNull(),
    verifierDigest: text().notNull(),
    issuedAt: text().notNull(),
    expiresAt: text().notNull(),
    failedAttempts: integer().notNull(),
  },
  (t) => [
    uniqueIndex("phone_proof_series_unique").on(t.moduleId, t.purpose, t.seriesKey),
    uniqueIndex("phone_proof_id_unique").on(t.moduleId, t.proofId),
  ],
);

export const encodeInstant = (millis: number) => new Date(millis).toISOString();

export const nativeSubject = (id: AuthSchema.SubjectId) => {
  if (!/^customer:[1-9][0-9]*$/.test(id))
    // oxlint-disable-next-line effect/no-untyped-throw -- The SQL mapping codec is synchronous; its adapter captures this typed failure.
    throw PersistenceMappingError.make({
      operation: "phone-example-codec",
      cause: "invalid consumer value",
    });
  const result = Number(id.slice(9));

  if (!Number.isSafeInteger(result))
    // oxlint-disable-next-line effect/no-untyped-throw -- The SQL mapping codec is synchronous; its adapter captures this typed failure.
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

const bindingCodec = Schema.fromJsonString(Proofs.ProofBinding);

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

export const proofs = {
  constraints: requiredProofConstraints,
  subjectId,
  subject: { table: customer, id: "customerNo" },
  clock: {
    encodeInstant,
    decodeInstant: (value) => {
      if (typeof value !== "string" || !Number.isFinite(Date.parse(value)))
        // oxlint-disable-next-line effect/no-untyped-throw -- The SQL mapping codec is synchronous; its adapter captures this typed failure.
        throw PersistenceMappingError.make({
          operation: "phone-example-codec",
          cause: "invalid consumer value",
        });

      return Date.parse(value);
    },
    engineNowMillis,
    toMillis: (expression: SQL) =>
      sql`cast(round((julianday(${expression}) - 2440587.5) * 86400000) as integer)`,
    fromMillis: (expression: SQL) =>
      sql`strftime('%Y-%m-%dT%H:%M:%fZ', ${expression} / 1000.0, 'unixepoch')`,
  },
  proof: {
    table: proof,
    moduleId: "moduleId",
    purpose: "purpose",
    seriesKey: "seriesKey",
    proofId: "proofId",
    binding: "binding",
    verifierKeyId: "verifierKeyId",
    verifierDigest: "verifierDigest",
    issuedAt: "issuedAt",
    expiresAt: "expiresAt",
    failedAttempts: "failedAttempts",
    encodeInsert: ({ record, seriesKey }) => ({
      moduleId: record.moduleId,
      purpose: record.purpose,
      proofId: record.proofId,
      seriesKey,
      binding: Schema.encodeSync(bindingCodec)(record.binding),
      verifierKeyId: record.verifier.keyId,
      verifierDigest: record.verifier.digest,
      issuedAt: encodeInstant(0),
      expiresAt: encodeInstant(0),
      failedAttempts: 0,
    }),
  },
} satisfies ProofPersistenceMapping<typeof proof, typeof customer, number>;

export const lifecyclePolicy: PhoneOtp.PhoneLifecyclePolicy = {
  maximumEvidenceAgeMillis: 60_000,
  requireImmediateInvalidation: false,
};

export const admissionPolicy: PhoneOtp.PhoneAdmissionPolicy = {
  windowMillis: 60_000,
  networkRequests: 30,
  networkAttempts: 100,
  maximumMessages: 100,
};

export const mapping: PhoneMapping<
  typeof customer,
  typeof identifier,
  typeof credential,
  typeof proof,
  number
> = {
  moduleId: "shop/phone",
  policy: lifecyclePolicy,
  constraints: requiredPhoneConstraints,
  proofs,
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
    moduleId: "moduleId",
    credentialId: "credentialId",
    namespace: "namespace",
    value: "value",
    subjectId: "customerNo",
    revision: "custody",
    verifiedAt: "verifiedAt",
    status: "enabled",
    activeCondition: sql`${identifier.enabled}=1`,
    encodeStatus: (active) => active,
    encodeInsert: (input) => ({
      moduleId: input.moduleId,
      credentialId: input.credentialId,
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
};

/** The consumer owns these migrations. No session table exists in this application. */
export const migrate = Effect.gen(function* () {
  const client = yield* SqlClient.SqlClient;

  for (const statement of [
    "create table phone_customer(customerNo integer primary key, enabled integer not null, security text not null,segment text not null,locale text not null)",
    "create table phone_identifier(moduleId text not null,credentialId text not null,namespace text not null,value text not null,customerNo integer not null,custody text not null,verifiedAt text,enabled integer not null,unique(namespace,value))",
    "create table phone_factor(key text primary key,customerNo integer not null,revision text not null,enabled integer not null)",
    "create table phone_proof(moduleId text not null,purpose text not null,seriesKey text not null,proofId text not null,binding text not null,verifierKeyId text not null,verifierDigest text not null,issuedAt text not null,expiresAt text not null,failedAttempts integer not null,unique(moduleId,purpose,seriesKey),unique(moduleId,proofId))",
  ])
    yield* client.unsafe(statement);
});
