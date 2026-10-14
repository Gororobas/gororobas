import { integer, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";

export const passkeyCredentials = sqliteTable(
  "app_passkey_credentials",
  {
    credentialId: text("c_credential_id").notNull(),
    subjectId: text("c_subject_id").notNull(),
    rpId: text("c_rp_id").notNull(),
    protocolCredentialId: text("c_protocol_credential_id").notNull(),
    credentialKey: text("c_credential_key").notNull(),
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
    name: text("c_name").notNull(),
    createdAt: integer("c_created_at").notNull(),
    lastUsedAt: integer("c_last_used_at"),
  },
  (table) => [
    uniqueIndex("app_passkey_credentials_key_0").on(table.credentialId),
    uniqueIndex("app_passkey_credentials_key_1").on(table.credentialKey),
  ],
);

export const passkeyFlows = sqliteTable(
  "app_passkey_flows",
  {
    moduleId: text("c_module_id").notNull(),
    flowId: text("c_flow_id").notNull(),
    purpose: text("c_purpose").notNull(),
    snapshot: text("c_snapshot").notNull(),
    requestBindingVerifier: text("c_request_binding_verifier").notNull(),
    requestBindingExpiresAt: integer("c_request_binding_expires_at").notNull(),
    issuedAt: integer("c_issued_at").notNull(),
    expiresAt: integer("c_expires_at").notNull(),
  },
  (table) => [uniqueIndex("app_passkey_flows_key_0").on(table.moduleId, table.flowId)],
);
