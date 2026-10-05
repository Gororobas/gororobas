import { AuthPersistence } from "@yielded/auth-persistence";

// Application-owned SQL names, column representations, and unique keys.
export const passkeyCredentials = AuthPersistence.table({
  name: "app_passkey_credentials",
  columns: {
    credentialId: { name: "c_credential_id", type: "text" },
    subjectId: { name: "c_subject_id", type: "text" },
    rpId: { name: "c_rp_id", type: "text" },
    protocolCredentialId: { name: "c_protocol_credential_id", type: "text" },
    credentialKey: { name: "c_credential_key", type: "text" },
    handleKey: { name: "c_handle_key", type: "text" },
    userHandle: { name: "c_user_handle", type: "text" },
    publicKey: { name: "c_public_key", type: "text" },
    algorithm: { name: "c_algorithm", type: "integer" },
    profile: { name: "c_profile", type: "text" },
    credentialRevision: { name: "c_credential_revision", type: "text" },
    active: { name: "c_active", type: "boolean" },
    primarySignIn: { name: "c_primary_sign_in", type: "boolean" },
    enrollmentUserVerified: { name: "c_enrollment_user_verified", type: "boolean" },
    backupEligible: { name: "c_backup_eligible", type: "boolean" },
    backupState: { name: "c_backup_state", type: "boolean" },
    counter: { name: "c_counter", type: "integer" },
    maximumCounter: { name: "c_maximum_counter", type: "integer" },
    name: { name: "c_name", type: "text" },
    createdAt: { name: "c_created_at", type: "integer" },
    lastUsedAt: { name: "c_last_used_at", type: "integer", nullable: true },
  },
  unique: [["credentialId"], ["credentialKey"]],
});

export const passkeyOwnership = AuthPersistence.table({
  name: "app_passkey_ownership",
  columns: {
    credentialKey: { name: "c_credential_key", type: "text" },
    rpId: { name: "c_rp_id", type: "text" },
    protocolCredentialId: { name: "c_protocol_credential_id", type: "text" },
    subjectId: { name: "c_subject_id", type: "text", nullable: true },
    credentialId: { name: "c_credential_id", type: "text", nullable: true },
    state: { name: "c_state", type: "text" },
    version: { name: "c_version", type: "text" },
    reservationId: { name: "c_reservation_id", type: "text", nullable: true },
  },
  unique: [["credentialKey"]],
});

export const passkeyHandles = AuthPersistence.table({
  name: "app_passkey_handles",
  columns: {
    handleKey: { name: "c_handle_key", type: "text" },
    rpId: { name: "c_rp_id", type: "text" },
    userHandle: { name: "c_user_handle", type: "text" },
    subjectId: { name: "c_subject_id", type: "text", nullable: true },
    state: { name: "c_state", type: "text" },
    version: { name: "c_version", type: "text" },
    reservationId: { name: "c_reservation_id", type: "text", nullable: true },
  },
  unique: [["handleKey"], ["rpId", "subjectId"]],
});

export const passkeyModules = AuthPersistence.table({
  name: "app_passkey_modules",
  columns: {
    moduleId: { name: "c_module_id", type: "text" },
    active: { name: "c_active", type: "boolean" },
    policyRevision: { name: "c_policy_revision", type: "text" },
    policy: { name: "c_policy", type: "text" },
  },
  unique: [["moduleId"]],
});

export const passkeyFlows = AuthPersistence.table({
  name: "app_passkey_flows",
  columns: {
    moduleId: { name: "c_module_id", type: "text" },
    flowId: { name: "c_flow_id", type: "text" },
    commandId: { name: "c_command_id", type: "text" },
    purpose: { name: "c_purpose", type: "text" },
    state: { name: "c_state", type: "text" },
    version: { name: "c_version", type: "text" },
    generation: { name: "c_generation", type: "integer" },
    snapshot: { name: "c_snapshot", type: "text" },
    policySnapshot: { name: "c_policy_snapshot", type: "text" },
    requestBindingVerifier: { name: "c_request_binding_verifier", type: "text" },
    requestBindingExpiresAt: { name: "c_request_binding_expires_at", type: "integer" },
    issuedAt: { name: "c_issued_at", type: "integer" },
    expiresAt: { name: "c_expires_at", type: "integer" },
    retentionUntil: { name: "c_retention_until", type: "integer" },
    claimId: { name: "c_claim_id", type: "text", nullable: true },
    claimedAt: { name: "c_claimed_at", type: "integer", nullable: true },
    claimExpiresAt: { name: "c_claim_expires_at", type: "integer", nullable: true },
    credentialSnapshot: { name: "c_credential_snapshot", type: "text", nullable: true },
    subjectScope: { name: "c_subject_scope", type: "text", nullable: true },
    targetScope: { name: "c_target_scope", type: "text", nullable: true },
  },
  unique: [
    ["moduleId", "flowId"],
    ["moduleId", "commandId"],
  ],
});

export const passkeyAdmissions = AuthPersistence.table({
  name: "app_passkey_admissions",
  columns: {
    authorityScope: { name: "c_authority_scope", type: "text" },
    moduleId: { name: "c_module_id", type: "text" },
    version: { name: "c_version", type: "text" },
    ownerMarker: { name: "c_owner_marker", type: "text" },
    admittedAt: { name: "c_admitted_at", type: "integer", nullable: true },
  },
  unique: [["authorityScope", "moduleId"]],
});

export const passkeyCharges = AuthPersistence.table({
  name: "app_passkey_charges",
  columns: {
    moduleId: { name: "c_module_id", type: "text" },
    flowId: { name: "c_flow_id", type: "text" },
    purpose: { name: "c_purpose", type: "text" },
    kind: { name: "c_kind", type: "text" },
    scope: { name: "c_scope", type: "text" },
    originalWindowMillis: { name: "c_original_window_millis", type: "integer" },
    admittedAt: { name: "c_admitted_at", type: "integer", nullable: true },
    retainUntil: { name: "c_retain_until", type: "integer", nullable: true },
    version: { name: "c_version", type: "text" },
    ownerMarker: { name: "c_owner_marker", type: "text" },
  },
  unique: [["moduleId", "flowId", "kind"]],
});

export const passkeyCommands = AuthPersistence.table({
  name: "app_passkey_commands",
  columns: {
    moduleId: { name: "c_module_id", type: "text" },
    commandId: { name: "c_command_id", type: "text" },
    subjectId: { name: "c_subject_id", type: "text" },
    credentialId: { name: "c_credential_id", type: "text" },
    intent: { name: "c_intent", type: "text" },
    decision: { name: "c_decision", type: "text" },
    retentionUntil: { name: "c_retention_until", type: "integer" },
    version: { name: "c_version", type: "text" },
  },
  unique: [["moduleId", "commandId"]],
});
