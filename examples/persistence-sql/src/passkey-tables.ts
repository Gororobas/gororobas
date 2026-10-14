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
    name: { name: "c_name", type: "text" },
    createdAt: { name: "c_created_at", type: "integer" },
    lastUsedAt: { name: "c_last_used_at", type: "integer", nullable: true },
  },
  unique: [["credentialId"], ["credentialKey"]],
});

export const passkeyFlows = AuthPersistence.table({
  name: "app_passkey_flows",
  columns: {
    moduleId: { name: "c_module_id", type: "text" },
    flowId: { name: "c_flow_id", type: "text" },
    purpose: { name: "c_purpose", type: "text" },
    snapshot: { name: "c_snapshot", type: "text" },
    requestBindingVerifier: { name: "c_request_binding_verifier", type: "text" },
    requestBindingExpiresAt: { name: "c_request_binding_expires_at", type: "integer" },
    issuedAt: { name: "c_issued_at", type: "integer" },
    expiresAt: { name: "c_expires_at", type: "integer" },
  },
  unique: [["moduleId", "flowId"]],
});
