import { integer, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";

// Existing application table. The application owns its schema and customer IDs.
export const customers = sqliteTable("customers", {
  id: text("customer_key").primaryKey(),
  enabled: integer("enabled", { mode: "boolean" }).notNull(),
  securityRevision: text("auth_revision").notNull(),
  displayName: text("display_name").notNull(),
});

export const identifiers = sqliteTable(
  "app_identifiers",
  {
    moduleId: text("c_module_id"),
    credentialId: text("c_credential_id"),
    namespace: text("c_namespace").notNull(),
    value: text("c_value").notNull(),
    subjectId: text("c_subject_id").notNull(),
    revision: text("c_revision").notNull(),
    verifiedAt: integer("c_verified_at"),
    active: integer("c_active", { mode: "boolean" }).notNull(),
  },
  (table) => [uniqueIndex("app_identifiers_key_0").on(table.namespace, table.value)],
);

export const credentials = sqliteTable(
  "app_credentials",
  {
    credentialId: text("c_credential_id").notNull(),
    subjectId: text("c_subject_id").notNull(),
    revision: text("c_revision").notNull(),
    active: integer("c_active", { mode: "boolean" }).notNull(),
  },
  (table) => [uniqueIndex("app_credentials_key_0").on(table.credentialId)],
);

export const passwords = sqliteTable(
  "app_passwords",
  {
    moduleId: text("c_module_id").notNull(),
    subjectId: text("c_subject_id").notNull(),
    credentialId: text("c_credential_id").notNull(),
    credentialRevision: text("c_credential_revision").notNull(),
    verifierVersion: text("c_verifier_version").notNull(),
    verifier: text("c_verifier").notNull(),
    normalization: text("c_normalization").notNull(),
  },
  (table) => [
    uniqueIndex("app_passwords_key_0").on(table.moduleId, table.subjectId),
    uniqueIndex("app_passwords_key_1").on(table.moduleId, table.credentialId),
  ],
);

export const proofs = sqliteTable(
  "app_proofs",
  {
    moduleId: text("c_module_id").notNull(),
    purpose: text("c_purpose").notNull(),
    seriesKey: text("c_series_key").notNull(),
    proofId: text("c_proof_id").notNull(),
    binding: text("c_binding").notNull(),
    verifierKeyId: text("c_verifier_key_id").notNull(),
    verifierDigest: text("c_verifier_digest").notNull(),
    issuedAt: integer("c_issued_at").notNull(),
    expiresAt: integer("c_expires_at").notNull(),
    failedAttempts: integer("c_failed_attempts").notNull(),
  },
  (table) => [
    uniqueIndex("app_proofs_key_0").on(table.moduleId, table.purpose, table.seriesKey),
    uniqueIndex("app_proofs_key_1").on(table.moduleId, table.proofId),
  ],
);

export const sessions = sqliteTable(
  "app_sessions",
  {
    sessionId: text("c_session_id").notNull(),
    subjectId: text("c_subject_id").notNull(),
    digest: text("c_digest").notNull(),
    securityRevision: text("c_security_revision").notNull(),
    issuedAt: integer("c_issued_at").notNull(),
    expiresAt: integer("c_expires_at").notNull(),
    absoluteExpiresAt: integer("c_absolute_expires_at").notNull(),
    record: text("c_record").notNull(),
  },
  (table) => [
    uniqueIndex("app_sessions_key_0").on(table.sessionId),
    uniqueIndex("app_sessions_key_1").on(table.digest),
  ],
);

export const pending = sqliteTable(
  "app_pending",
  {
    moduleId: text("c_module_id").notNull(),
    kind: text("c_kind").notNull(),
    digest: text("c_digest").notNull(),
    version: text("c_version").notNull(),
    flowId: text("c_flow_id").notNull(),
    subjectId: text("c_subject_id").notNull(),
    bindingDigest: text("c_binding_digest").notNull(),
    snapshot: text("c_snapshot").notNull(),
    expiresAt: integer("c_expires_at").notNull(),
    attemptLimit: integer("c_attempt_limit").notNull(),
    failedAttempts: integer("c_failed_attempts").notNull(),
    consumed: integer("c_consumed", { mode: "boolean" }).notNull(),
  },
  (table) => [uniqueIndex("app_pending_key_0").on(table.digest)],
);

export const emailCredentials = sqliteTable(
  "app_email_credentials",
  {
    moduleId: text("c_module_id").notNull(),
    subjectId: text("c_subject_id").notNull(),
    credentialId: text("c_credential_id").notNull(),
    identifierNamespace: text("c_identifier_namespace").notNull(),
    identifierValue: text("c_identifier_value").notNull(),
    credentialRevision: text("c_credential_revision").notNull(),
    active: integer("c_active", { mode: "boolean" }).notNull(),
  },
  (table) => [
    uniqueIndex("app_email_credentials_key_0").on(table.moduleId, table.credentialId),
    uniqueIndex("app_email_credentials_key_1").on(
      table.moduleId,
      table.identifierNamespace,
      table.identifierValue,
    ),
  ],
);
