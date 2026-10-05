import { integer, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";

export const passkeyCredentials = sqliteTable(
  "app_passkey_credentials",
  {
    credentialId: text("c_credential_id").notNull(),
    subjectId: text("c_subject_id").notNull(),
    rpId: text("c_rp_id").notNull(),
    protocolCredentialId: text("c_protocol_credential_id").notNull(),
    credentialKey: text("c_credential_key").notNull(),
    handleKey: text("c_handle_key").notNull(),
    userHandle: text("c_user_handle").notNull(),
    publicKey: text("c_public_key").notNull(),
    algorithm: integer("c_algorithm").notNull(),
    profile: text("c_profile").notNull(),
    credentialRevision: text("c_credential_revision").notNull(),
    active: integer("c_active", { mode: "boolean" }).notNull(),
    primarySignIn: integer("c_primary_sign_in", { mode: "boolean" }).notNull(),
    enrollmentUserVerified: integer("c_enrollment_user_verified", { mode: "boolean" }).notNull(),
    backupEligible: integer("c_backup_eligible", { mode: "boolean" }).notNull(),
    backupState: integer("c_backup_state", { mode: "boolean" }).notNull(),
    counter: integer("c_counter").notNull(),
    maximumCounter: integer("c_maximum_counter").notNull(),
    name: text("c_name").notNull(),
    createdAt: integer("c_created_at").notNull(),
    lastUsedAt: integer("c_last_used_at"),
  },
  (table) => [
    uniqueIndex("app_passkey_credentials_key_0").on(table.credentialId),
    uniqueIndex("app_passkey_credentials_key_1").on(table.credentialKey),
  ],
);

export const passkeyOwnership = sqliteTable(
  "app_passkey_ownership",
  {
    credentialKey: text("c_credential_key").notNull(),
    rpId: text("c_rp_id").notNull(),
    protocolCredentialId: text("c_protocol_credential_id").notNull(),
    subjectId: text("c_subject_id"),
    credentialId: text("c_credential_id"),
    state: text("c_state").notNull(),
    version: text("c_version").notNull(),
    reservationId: text("c_reservation_id"),
  },
  (table) => [uniqueIndex("app_passkey_ownership_key_0").on(table.credentialKey)],
);

export const passkeyHandles = sqliteTable(
  "app_passkey_handles",
  {
    handleKey: text("c_handle_key").notNull(),
    rpId: text("c_rp_id").notNull(),
    userHandle: text("c_user_handle").notNull(),
    subjectId: text("c_subject_id"),
    state: text("c_state").notNull(),
    version: text("c_version").notNull(),
    reservationId: text("c_reservation_id"),
  },
  (table) => [
    uniqueIndex("app_passkey_handles_key_0").on(table.handleKey),
    uniqueIndex("app_passkey_handles_key_1").on(table.rpId, table.subjectId),
  ],
);

export const passkeyModules = sqliteTable(
  "app_passkey_modules",
  {
    moduleId: text("c_module_id").notNull(),
    active: integer("c_active", { mode: "boolean" }).notNull(),
    policyRevision: text("c_policy_revision").notNull(),
    policy: text("c_policy").notNull(),
  },
  (table) => [uniqueIndex("app_passkey_modules_key_0").on(table.moduleId)],
);

export const passkeyFlows = sqliteTable(
  "app_passkey_flows",
  {
    moduleId: text("c_module_id").notNull(),
    flowId: text("c_flow_id").notNull(),
    commandId: text("c_command_id").notNull(),
    purpose: text("c_purpose").notNull(),
    state: text("c_state").notNull(),
    version: text("c_version").notNull(),
    generation: integer("c_generation").notNull(),
    snapshot: text("c_snapshot").notNull(),
    policySnapshot: text("c_policy_snapshot").notNull(),
    requestBindingVerifier: text("c_request_binding_verifier").notNull(),
    requestBindingExpiresAt: integer("c_request_binding_expires_at").notNull(),
    issuedAt: integer("c_issued_at").notNull(),
    expiresAt: integer("c_expires_at").notNull(),
    retentionUntil: integer("c_retention_until").notNull(),
    claimId: text("c_claim_id"),
    claimedAt: integer("c_claimed_at"),
    claimExpiresAt: integer("c_claim_expires_at"),
    credentialSnapshot: text("c_credential_snapshot"),
    subjectScope: text("c_subject_scope"),
    targetScope: text("c_target_scope"),
  },
  (table) => [
    uniqueIndex("app_passkey_flows_key_0").on(table.moduleId, table.flowId),
    uniqueIndex("app_passkey_flows_key_1").on(table.moduleId, table.commandId),
  ],
);

export const passkeyAdmissions = sqliteTable(
  "app_passkey_admissions",
  {
    authorityScope: text("c_authority_scope").notNull(),
    moduleId: text("c_module_id").notNull(),
    version: text("c_version").notNull(),
    ownerMarker: text("c_owner_marker").notNull(),
    admittedAt: integer("c_admitted_at"),
  },
  (table) => [uniqueIndex("app_passkey_admissions_key_0").on(table.authorityScope, table.moduleId)],
);

export const passkeyCharges = sqliteTable(
  "app_passkey_charges",
  {
    moduleId: text("c_module_id").notNull(),
    flowId: text("c_flow_id").notNull(),
    purpose: text("c_purpose").notNull(),
    kind: text("c_kind").notNull(),
    scope: text("c_scope").notNull(),
    originalWindowMillis: integer("c_original_window_millis").notNull(),
    admittedAt: integer("c_admitted_at"),
    retainUntil: integer("c_retain_until"),
    version: text("c_version").notNull(),
    ownerMarker: text("c_owner_marker").notNull(),
  },
  (table) => [
    uniqueIndex("app_passkey_charges_key_0").on(table.moduleId, table.flowId, table.kind),
  ],
);

export const passkeyCommands = sqliteTable(
  "app_passkey_commands",
  {
    moduleId: text("c_module_id").notNull(),
    commandId: text("c_command_id").notNull(),
    subjectId: text("c_subject_id").notNull(),
    credentialId: text("c_credential_id").notNull(),
    intent: text("c_intent").notNull(),
    decision: text("c_decision").notNull(),
    retentionUntil: integer("c_retention_until").notNull(),
    version: text("c_version").notNull(),
  },
  (table) => [uniqueIndex("app_passkey_commands_key_0").on(table.moduleId, table.commandId)],
);
