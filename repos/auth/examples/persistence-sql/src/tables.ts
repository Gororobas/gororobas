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
    moduleId: { name: "c_module_id", type: "text", nullable: true },
    credentialId: { name: "c_credential_id", type: "text", nullable: true },
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

export const proofs = AuthPersistence.table({
  name: "app_proofs",
  columns: {
    moduleId: { name: "c_module_id", type: "text" },
    purpose: { name: "c_purpose", type: "text" },
    seriesKey: { name: "c_series_key", type: "text" },
    proofId: { name: "c_proof_id", type: "text" },
    binding: { name: "c_binding", type: "text" },
    verifierKeyId: { name: "c_verifier_key_id", type: "text" },
    verifierDigest: { name: "c_verifier_digest", type: "text" },
    issuedAt: { name: "c_issued_at", type: "integer" },
    expiresAt: { name: "c_expires_at", type: "integer" },
    failedAttempts: { name: "c_failed_attempts", type: "integer" },
  },
  unique: [
    ["moduleId", "purpose", "seriesKey"],
    ["moduleId", "proofId"],
  ],
});

export const sessions = AuthPersistence.table({
  name: "app_sessions",
  columns: {
    sessionId: { name: "c_session_id", type: "text" },
    subjectId: { name: "c_subject_id", type: "text" },
    digest: { name: "c_digest", type: "text" },
    securityRevision: { name: "c_security_revision", type: "text" },
    issuedAt: { name: "c_issued_at", type: "integer" },
    expiresAt: { name: "c_expires_at", type: "integer" },
    absoluteExpiresAt: { name: "c_absolute_expires_at", type: "integer" },
    record: { name: "c_record", type: "text" },
  },
  unique: [["sessionId"], ["digest"]],
});

export const pending = AuthPersistence.table({
  name: "app_pending",
  columns: {
    moduleId: { name: "c_module_id", type: "text" },
    kind: { name: "c_kind", type: "text" },
    digest: { name: "c_digest", type: "text" },
    version: { name: "c_version", type: "text" },
    flowId: { name: "c_flow_id", type: "text" },
    subjectId: { name: "c_subject_id", type: "text" },
    bindingDigest: { name: "c_binding_digest", type: "text" },
    snapshot: { name: "c_snapshot", type: "text" },
    expiresAt: { name: "c_expires_at", type: "integer" },
    attemptLimit: { name: "c_attempt_limit", type: "integer" },
    failedAttempts: { name: "c_failed_attempts", type: "integer" },
    consumed: { name: "c_consumed", type: "boolean" },
  },
  unique: [["digest"]],
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
