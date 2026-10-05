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

export const passwordAttempts = sqliteTable(
  "app_password_attempts",
  {
    moduleId: text("c_module_id").notNull(),
    action: text("c_action").notNull(),
    attemptId: text("c_attempt_id").notNull(),
    identifierNamespace: text("c_identifier_namespace").notNull(),
    identifierValue: text("c_identifier_value").notNull(),
    subjectId: text("c_subject_id"),
    credentialId: text("c_credential_id"),
    securityRevision: text("c_security_revision"),
    credentialRevision: text("c_credential_revision"),
    verifierVersion: text("c_verifier_version"),
    identifierBindingRevision: text("c_identifier_binding_revision"),
    admittedAt: integer("c_admitted_at").notNull(),
    deadline: integer("c_deadline").notNull(),
    retentionUntil: integer("c_retention_until").notNull(),
    state: text("c_state").notNull(),
  },
  (table) => [uniqueIndex("app_password_attempts_key_0").on(table.moduleId, table.attemptId)],
);

export const passwordScopes = sqliteTable(
  "app_password_scopes",
  {
    moduleId: text("c_module_id").notNull(),
    action: text("c_action").notNull(),
    scopeKind: text("c_scope_kind").notNull(),
    scopeKey: text("c_scope_key").notNull(),
  },
  (table) => [
    uniqueIndex("app_password_scopes_key_0").on(
      table.moduleId,
      table.action,
      table.scopeKind,
      table.scopeKey,
    ),
  ],
);

export const passwordCharges = sqliteTable(
  "app_password_charges",
  {
    moduleId: text("c_module_id").notNull(),
    action: text("c_action").notNull(),
    scopeKind: text("c_scope_kind").notNull(),
    scopeKey: text("c_scope_key").notNull(),
    attemptId: text("c_attempt_id").notNull(),
    occurredAt: integer("c_occurred_at").notNull(),
    retentionUntil: integer("c_retention_until").notNull(),
  },
  (table) => [
    uniqueIndex("app_password_charges_key_0").on(
      table.moduleId,
      table.action,
      table.scopeKind,
      table.scopeKey,
      table.attemptId,
    ),
  ],
);

export const passwordCommands = sqliteTable(
  "app_password_commands",
  {
    moduleId: text("c_module_id").notNull(),
    commandId: text("c_command_id").notNull(),
    action: text("c_action").notNull(),
    bindingDigest: text("c_binding_digest").notNull(),
    decision: text("c_decision").notNull(),
    retentionUntil: integer("c_retention_until").notNull(),
  },
  (table) => [uniqueIndex("app_password_commands_key_0").on(table.moduleId, table.commandId)],
);

export const proofRequests = sqliteTable(
  "app_proof_requests",
  {
    moduleId: text("c_module_id").notNull(),
    requestId: text("c_request_id").notNull(),
    fingerprint: text("c_fingerprint").notNull(),
    proofId: text("c_proof_id").notNull(),
    purpose: text("c_purpose").notNull(),
    keyId: text("c_key_id").notNull(),
    createdAt: integer("c_created_at").notNull(),
    retentionUntil: integer("c_retention_until").notNull(),
    receipt: text("c_receipt").notNull(),
  },
  (table) => [uniqueIndex("app_proof_requests_key_0").on(table.moduleId, table.requestId)],
);

export const proofSeries = sqliteTable(
  "app_proof_series",
  {
    moduleId: text("c_module_id").notNull(),
    purpose: text("c_purpose").notNull(),
    scopeKey: text("c_scope_key").notNull(),
    activeProofId: text("c_active_proof_id"),
    lastIssueAt: integer("c_last_issue_at"),
    version: text("c_version").notNull(),
  },
  (table) => [
    uniqueIndex("app_proof_series_key_0").on(table.moduleId, table.purpose, table.scopeKey),
  ],
);

export const proofGenerations = sqliteTable(
  "app_proof_generations",
  {
    moduleId: text("c_module_id").notNull(),
    purpose: text("c_purpose").notNull(),
    proofId: text("c_proof_id").notNull(),
    requestId: text("c_request_id").notNull(),
    seriesKey: text("c_series_key").notNull(),
    deliveryId: text("c_delivery_id").notNull(),
    binding: text("c_binding").notNull(),
    verifierKeyId: text("c_verifier_key_id").notNull(),
    verifierDigest: text("c_verifier_digest").notNull(),
    issuedAt: integer("c_issued_at").notNull(),
    expiresAt: integer("c_expires_at").notNull(),
    version: text("c_version").notNull(),
    state: text("c_state").notNull(),
    sendCount: integer("c_send_count").notNull(),
    deliveryState: text("c_delivery_state").notNull(),
    claimVersion: text("c_claim_version"),
    claimDeadline: integer("c_claim_deadline"),
    retryAt: integer("c_retry_at"),
    deliveryRetryMillis: integer("c_delivery_retry_millis").notNull(),
    retentionUntil: integer("c_retention_until").notNull(),
    fingerprint: text("c_fingerprint").notNull(),
  },
  (table) => [
    uniqueIndex("app_proof_generations_key_0").on(table.moduleId, table.proofId),
    uniqueIndex("app_proof_generations_key_1").on(table.moduleId, table.deliveryId),
  ],
);

export const proofContinuations = sqliteTable(
  "app_proof_continuations",
  {
    moduleId: text("c_module_id").notNull(),
    purpose: text("c_purpose").notNull(),
    continuationId: text("c_continuation_id").notNull(),
    digest: text("c_digest").notNull(),
    proofId: text("c_proof_id").notNull(),
    seriesKey: text("c_series_key").notNull(),
    binding: text("c_binding").notNull(),
    expiresAt: integer("c_expires_at").notNull(),
    consumed: integer("c_consumed", { mode: "boolean" }).notNull(),
    version: text("c_version").notNull(),
    retentionUntil: integer("c_retention_until").notNull(),
  },
  (table) => [
    uniqueIndex("app_proof_continuations_key_0").on(table.moduleId, table.continuationId),
    uniqueIndex("app_proof_continuations_key_1").on(table.moduleId, table.digest),
  ],
);

export const proofScopes = sqliteTable(
  "app_proof_scopes",
  {
    moduleId: text("c_module_id").notNull(),
    purpose: text("c_purpose").notNull(),
    action: text("c_action").notNull(),
    scopeKind: text("c_scope_kind").notNull(),
    scopeKey: text("c_scope_key").notNull(),
  },
  (table) => [
    uniqueIndex("app_proof_scopes_key_0").on(
      table.moduleId,
      table.purpose,
      table.action,
      table.scopeKind,
      table.scopeKey,
    ),
  ],
);

export const proofAbuse = sqliteTable(
  "app_proof_abuse",
  {
    moduleId: text("c_module_id").notNull(),
    purpose: text("c_purpose").notNull(),
    action: text("c_action").notNull(),
    scopeKind: text("c_scope_kind").notNull(),
    scopeKey: text("c_scope_key").notNull(),
    commandId: text("c_command_id").notNull(),
    occurredAt: integer("c_occurred_at").notNull(),
    retentionUntil: integer("c_retention_until").notNull(),
  },
  (table) => [
    uniqueIndex("app_proof_abuse_key_0").on(
      table.moduleId,
      table.action,
      table.scopeKind,
      table.scopeKey,
      table.commandId,
    ),
  ],
);

export const proofFailures = sqliteTable(
  "app_proof_failures",
  {
    moduleId: text("c_module_id").notNull(),
    purpose: text("c_purpose").notNull(),
    seriesKey: text("c_series_key").notNull(),
    commandId: text("c_command_id").notNull(),
    occurredAt: integer("c_occurred_at").notNull(),
    retentionUntil: integer("c_retention_until").notNull(),
  },
  (table) => [
    uniqueIndex("app_proof_failures_key_0").on(table.moduleId, table.seriesKey, table.commandId),
  ],
);

export const proofCommands = sqliteTable(
  "app_proof_commands",
  {
    moduleId: text("c_module_id").notNull(),
    commandId: text("c_command_id").notNull(),
    kind: text("c_kind").notNull(),
    decision: text("c_decision").notNull(),
    retentionUntil: integer("c_retention_until").notNull(),
  },
  (table) => [uniqueIndex("app_proof_commands_key_0").on(table.moduleId, table.commandId)],
);

export const sessions = sqliteTable(
  "app_sessions",
  {
    sessionId: text("c_session_id").notNull(),
    subjectId: text("c_subject_id").notNull(),
    digest: text("c_digest").notNull(),
    version: text("c_version").notNull(),
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

export const sessionFlows = sqliteTable(
  "app_session_flows",
  {
    flowId: text("c_flow_id").notNull(),
    subjectId: text("c_subject_id").notNull(),
    state: text("c_state").notNull(),
    pendingDigest: text("c_pending_digest"),
    dedupUntil: integer("c_dedup_until").notNull(),
  },
  (table) => [uniqueIndex("app_session_flows_key_0").on(table.flowId)],
);

export const passwordRegistrations = sqliteTable(
  "app_password_registrations",
  {
    moduleId: text("c_module_id").notNull(),
    requestId: text("c_request_id").notNull(),
  },
  (table) => [uniqueIndex("app_password_registrations_key_0").on(table.moduleId, table.requestId)],
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

export const emailCommands = sqliteTable(
  "app_email_commands",
  {
    moduleId: text("c_module_id").notNull(),
    commandId: text("c_command_id").notNull(),
    action: text("c_action").notNull(),
    bindingDigest: text("c_binding_digest").notNull(),
    retentionUntil: integer("c_retention_until").notNull(),
  },
  (table) => [uniqueIndex("app_email_commands_key_0").on(table.moduleId, table.commandId)],
);
