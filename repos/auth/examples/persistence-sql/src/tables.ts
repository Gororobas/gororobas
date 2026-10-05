import { AuthPersistence } from "@yielded/auth-persistence";

// Application-owned SQL names, column representations, and unique keys.
export const customers = AuthPersistence.table({
  name: "customers",
  columns: {
    id: { name: "customer_key", type: "text" },
    enabled: { name: "enabled", type: "boolean" },
    securityRevision: { name: "auth_revision", type: "text" },
    displayName: { name: "display_name", type: "text" },
  },
  unique: [["id"]],
});

export const identifiers = AuthPersistence.table({
  name: "app_identifiers",
  columns: {
    namespace: { name: "c_namespace", type: "text" },
    value: { name: "c_value", type: "text" },
    subjectId: { name: "c_subject_id", type: "text" },
    revision: { name: "c_revision", type: "text" },
    verifiedAt: { name: "c_verified_at", type: "integer", nullable: true },
    active: { name: "c_active", type: "boolean" },
  },
  unique: [["namespace", "value"]],
});

export const credentials = AuthPersistence.table({
  name: "app_credentials",
  columns: {
    credentialId: { name: "c_credential_id", type: "text" },
    subjectId: { name: "c_subject_id", type: "text" },
    revision: { name: "c_revision", type: "text" },
    active: { name: "c_active", type: "boolean" },
  },
  unique: [["credentialId"]],
});

export const passwords = AuthPersistence.table({
  name: "app_passwords",
  columns: {
    moduleId: { name: "c_module_id", type: "text" },
    subjectId: { name: "c_subject_id", type: "text" },
    credentialId: { name: "c_credential_id", type: "text" },
    credentialRevision: { name: "c_credential_revision", type: "text" },
    verifierVersion: { name: "c_verifier_version", type: "text" },
    verifier: { name: "c_verifier", type: "text" },
    normalization: { name: "c_normalization", type: "text" },
  },
  unique: [
    ["moduleId", "subjectId"],
    ["moduleId", "credentialId"],
  ],
});

export const passwordAttempts = AuthPersistence.table({
  name: "app_password_attempts",
  columns: {
    moduleId: { name: "c_module_id", type: "text" },
    action: { name: "c_action", type: "text" },
    attemptId: { name: "c_attempt_id", type: "text" },
    identifierNamespace: { name: "c_identifier_namespace", type: "text" },
    identifierValue: { name: "c_identifier_value", type: "text" },
    subjectId: { name: "c_subject_id", type: "text", nullable: true },
    credentialId: { name: "c_credential_id", type: "text", nullable: true },
    securityRevision: { name: "c_security_revision", type: "text", nullable: true },
    credentialRevision: { name: "c_credential_revision", type: "text", nullable: true },
    verifierVersion: { name: "c_verifier_version", type: "text", nullable: true },
    identifierBindingRevision: {
      name: "c_identifier_binding_revision",
      type: "text",
      nullable: true,
    },
    admittedAt: { name: "c_admitted_at", type: "integer" },
    deadline: { name: "c_deadline", type: "integer" },
    retentionUntil: { name: "c_retention_until", type: "integer" },
    state: { name: "c_state", type: "text" },
  },
  unique: [["moduleId", "attemptId"]],
});

export const passwordScopes = AuthPersistence.table({
  name: "app_password_scopes",
  columns: {
    moduleId: { name: "c_module_id", type: "text" },
    action: { name: "c_action", type: "text" },
    scopeKind: { name: "c_scope_kind", type: "text" },
    scopeKey: { name: "c_scope_key", type: "text" },
  },
  unique: [["moduleId", "action", "scopeKind", "scopeKey"]],
});

export const passwordCharges = AuthPersistence.table({
  name: "app_password_charges",
  columns: {
    moduleId: { name: "c_module_id", type: "text" },
    action: { name: "c_action", type: "text" },
    scopeKind: { name: "c_scope_kind", type: "text" },
    scopeKey: { name: "c_scope_key", type: "text" },
    attemptId: { name: "c_attempt_id", type: "text" },
    occurredAt: { name: "c_occurred_at", type: "integer" },
    retentionUntil: { name: "c_retention_until", type: "integer" },
  },
  unique: [["moduleId", "action", "scopeKind", "scopeKey", "attemptId"]],
});

export const passwordCommands = AuthPersistence.table({
  name: "app_password_commands",
  columns: {
    moduleId: { name: "c_module_id", type: "text" },
    commandId: { name: "c_command_id", type: "text" },
    action: { name: "c_action", type: "text" },
    bindingDigest: { name: "c_binding_digest", type: "text" },
    decision: { name: "c_decision", type: "text" },
    retentionUntil: { name: "c_retention_until", type: "integer" },
  },
  unique: [["moduleId", "commandId"]],
});

export const proofRequests = AuthPersistence.table({
  name: "app_proof_requests",
  columns: {
    moduleId: { name: "c_module_id", type: "text" },
    requestId: { name: "c_request_id", type: "text" },
    fingerprint: { name: "c_fingerprint", type: "text" },
    proofId: { name: "c_proof_id", type: "text" },
    purpose: { name: "c_purpose", type: "text" },
    keyId: { name: "c_key_id", type: "text" },
    createdAt: { name: "c_created_at", type: "integer" },
    retentionUntil: { name: "c_retention_until", type: "integer" },
    receipt: { name: "c_receipt", type: "text" },
  },
  unique: [["moduleId", "requestId"]],
});

export const proofSeries = AuthPersistence.table({
  name: "app_proof_series",
  columns: {
    moduleId: { name: "c_module_id", type: "text" },
    purpose: { name: "c_purpose", type: "text" },
    scopeKey: { name: "c_scope_key", type: "text" },
    activeProofId: { name: "c_active_proof_id", type: "text", nullable: true },
    lastIssueAt: { name: "c_last_issue_at", type: "integer", nullable: true },
    version: { name: "c_version", type: "text" },
  },
  unique: [["moduleId", "purpose", "scopeKey"]],
});

export const proofGenerations = AuthPersistence.table({
  name: "app_proof_generations",
  columns: {
    moduleId: { name: "c_module_id", type: "text" },
    purpose: { name: "c_purpose", type: "text" },
    proofId: { name: "c_proof_id", type: "text" },
    requestId: { name: "c_request_id", type: "text" },
    seriesKey: { name: "c_series_key", type: "text" },
    deliveryId: { name: "c_delivery_id", type: "text" },
    binding: { name: "c_binding", type: "text" },
    verifierKeyId: { name: "c_verifier_key_id", type: "text" },
    verifierDigest: { name: "c_verifier_digest", type: "text" },
    issuedAt: { name: "c_issued_at", type: "integer" },
    expiresAt: { name: "c_expires_at", type: "integer" },
    version: { name: "c_version", type: "text" },
    state: { name: "c_state", type: "text" },
    sendCount: { name: "c_send_count", type: "integer" },
    deliveryState: { name: "c_delivery_state", type: "text" },
    claimVersion: { name: "c_claim_version", type: "text", nullable: true },
    claimDeadline: { name: "c_claim_deadline", type: "integer", nullable: true },
    retryAt: { name: "c_retry_at", type: "integer", nullable: true },
    deliveryRetryMillis: { name: "c_delivery_retry_millis", type: "integer" },
    retentionUntil: { name: "c_retention_until", type: "integer" },
    fingerprint: { name: "c_fingerprint", type: "text" },
  },
  unique: [
    ["moduleId", "proofId"],
    ["moduleId", "deliveryId"],
  ],
});

export const proofContinuations = AuthPersistence.table({
  name: "app_proof_continuations",
  columns: {
    moduleId: { name: "c_module_id", type: "text" },
    purpose: { name: "c_purpose", type: "text" },
    continuationId: { name: "c_continuation_id", type: "text" },
    digest: { name: "c_digest", type: "text" },
    proofId: { name: "c_proof_id", type: "text" },
    seriesKey: { name: "c_series_key", type: "text" },
    binding: { name: "c_binding", type: "text" },
    expiresAt: { name: "c_expires_at", type: "integer" },
    consumed: { name: "c_consumed", type: "boolean" },
    version: { name: "c_version", type: "text" },
    retentionUntil: { name: "c_retention_until", type: "integer" },
  },
  unique: [
    ["moduleId", "continuationId"],
    ["moduleId", "digest"],
  ],
});

export const proofScopes = AuthPersistence.table({
  name: "app_proof_scopes",
  columns: {
    moduleId: { name: "c_module_id", type: "text" },
    purpose: { name: "c_purpose", type: "text" },
    action: { name: "c_action", type: "text" },
    scopeKind: { name: "c_scope_kind", type: "text" },
    scopeKey: { name: "c_scope_key", type: "text" },
  },
  unique: [["moduleId", "purpose", "action", "scopeKind", "scopeKey"]],
});

export const proofAbuse = AuthPersistence.table({
  name: "app_proof_abuse",
  columns: {
    moduleId: { name: "c_module_id", type: "text" },
    purpose: { name: "c_purpose", type: "text" },
    action: { name: "c_action", type: "text" },
    scopeKind: { name: "c_scope_kind", type: "text" },
    scopeKey: { name: "c_scope_key", type: "text" },
    commandId: { name: "c_command_id", type: "text" },
    occurredAt: { name: "c_occurred_at", type: "integer" },
    retentionUntil: { name: "c_retention_until", type: "integer" },
  },
  unique: [["moduleId", "action", "scopeKind", "scopeKey", "commandId"]],
});

export const proofFailures = AuthPersistence.table({
  name: "app_proof_failures",
  columns: {
    moduleId: { name: "c_module_id", type: "text" },
    purpose: { name: "c_purpose", type: "text" },
    seriesKey: { name: "c_series_key", type: "text" },
    commandId: { name: "c_command_id", type: "text" },
    occurredAt: { name: "c_occurred_at", type: "integer" },
    retentionUntil: { name: "c_retention_until", type: "integer" },
  },
  unique: [["moduleId", "seriesKey", "commandId"]],
});

export const proofCommands = AuthPersistence.table({
  name: "app_proof_commands",
  columns: {
    moduleId: { name: "c_module_id", type: "text" },
    commandId: { name: "c_command_id", type: "text" },
    kind: { name: "c_kind", type: "text" },
    decision: { name: "c_decision", type: "text" },
    retentionUntil: { name: "c_retention_until", type: "integer" },
  },
  unique: [["moduleId", "commandId"]],
});

export const sessions = AuthPersistence.table({
  name: "app_sessions",
  columns: {
    sessionId: { name: "c_session_id", type: "text" },
    subjectId: { name: "c_subject_id", type: "text" },
    digest: { name: "c_digest", type: "text" },
    version: { name: "c_version", type: "text" },
    securityRevision: { name: "c_security_revision", type: "text" },
    issuedAt: { name: "c_issued_at", type: "integer" },
    expiresAt: { name: "c_expires_at", type: "integer" },
    absoluteExpiresAt: { name: "c_absolute_expires_at", type: "integer" },
    record: { name: "c_record", type: "text" },
  },
  unique: [["sessionId"], ["digest"]],
});

export const sessionFlows = AuthPersistence.table({
  name: "app_session_flows",
  columns: {
    flowId: { name: "c_flow_id", type: "text" },
    subjectId: { name: "c_subject_id", type: "text" },
    state: { name: "c_state", type: "text" },
    pendingDigest: { name: "c_pending_digest", type: "text", nullable: true },
    dedupUntil: { name: "c_dedup_until", type: "integer" },
  },
  unique: [["flowId"]],
});

export const passwordRegistrations = AuthPersistence.table({
  name: "app_password_registrations",
  columns: {
    moduleId: { name: "c_module_id", type: "text" },
    requestId: { name: "c_request_id", type: "text" },
  },
  unique: [["moduleId", "requestId"]],
});

export const emailCredentials = AuthPersistence.table({
  name: "app_email_credentials",
  columns: {
    moduleId: { name: "c_module_id", type: "text" },
    subjectId: { name: "c_subject_id", type: "text" },
    credentialId: { name: "c_credential_id", type: "text" },
    identifierNamespace: { name: "c_identifier_namespace", type: "text" },
    identifierValue: { name: "c_identifier_value", type: "text" },
    credentialRevision: { name: "c_credential_revision", type: "text" },
    active: { name: "c_active", type: "boolean" },
  },
  unique: [
    ["moduleId", "credentialId"],
    ["moduleId", "identifierNamespace", "identifierValue"],
  ],
});

export const emailCommands = AuthPersistence.table({
  name: "app_email_commands",
  columns: {
    moduleId: { name: "c_module_id", type: "text" },
    commandId: { name: "c_command_id", type: "text" },
    action: { name: "c_action", type: "text" },
    bindingDigest: { name: "c_binding_digest", type: "text" },
    retentionUntil: { name: "c_retention_until", type: "integer" },
  },
  unique: [["moduleId", "commandId"]],
});
