import { BrowserLoginPersistence } from "@yielded/auth-persistence";
import { Effect, Layer } from "effect";
import { Migrator, SqlClient } from "effect/sql";

// This application owns these migrations and their version history.
const initial = Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient;
  const booleanType = sql.onDialectOrElse({ pg: () => "boolean", orElse: () => "integer" });
  const integerType = sql.onDialectOrElse({ pg: () => "bigint", orElse: () => "integer" });

  yield* sql.unsafe(
    `create table customers (customer_key text primary key, enabled ${booleanType} not null, auth_revision text not null, display_name text not null)`,
  );
  yield* sql.unsafe(`create table "app_identifiers" (
  "c_namespace" text not null,
  "c_value" text not null,
  "c_subject_id" text not null,
  "c_revision" text not null,
  "c_verified_at" ${integerType},
  "c_active" ${booleanType} not null,
  unique ("c_namespace", "c_value")
)`);
  yield* sql.unsafe(`create table "app_credentials" (
  "c_credential_id" text not null,
  "c_subject_id" text not null,
  "c_revision" text not null,
  "c_active" ${booleanType} not null,
  unique ("c_credential_id")
)`);
  yield* sql.unsafe(`create table "app_passwords" (
  "c_module_id" text not null,
  "c_subject_id" text not null,
  "c_credential_id" text not null,
  "c_credential_revision" text not null,
  "c_verifier_version" text not null,
  "c_verifier" text not null,
  "c_normalization" text not null,
  unique ("c_module_id", "c_subject_id"),
  unique ("c_module_id", "c_credential_id")
)`);
  yield* sql.unsafe(`create table "app_password_attempts" (
  "c_module_id" text not null,
  "c_action" text not null,
  "c_attempt_id" text not null,
  "c_identifier_namespace" text not null,
  "c_identifier_value" text not null,
  "c_subject_id" text,
  "c_credential_id" text,
  "c_security_revision" text,
  "c_credential_revision" text,
  "c_verifier_version" text,
  "c_identifier_binding_revision" text,
  "c_admitted_at" ${integerType} not null,
  "c_deadline" ${integerType} not null,
  "c_retention_until" ${integerType} not null,
  "c_state" text not null,
  unique ("c_module_id", "c_attempt_id")
)`);
  yield* sql.unsafe(`create table "app_password_scopes" (
  "c_module_id" text not null,
  "c_action" text not null,
  "c_scope_kind" text not null,
  "c_scope_key" text not null,
  unique ("c_module_id", "c_action", "c_scope_kind", "c_scope_key")
)`);
  yield* sql.unsafe(`create table "app_password_charges" (
  "c_module_id" text not null,
  "c_action" text not null,
  "c_scope_kind" text not null,
  "c_scope_key" text not null,
  "c_attempt_id" text not null,
  "c_occurred_at" ${integerType} not null,
  "c_retention_until" ${integerType} not null,
  unique ("c_module_id", "c_action", "c_scope_kind", "c_scope_key", "c_attempt_id")
)`);
  yield* sql.unsafe(`create table "app_password_commands" (
  "c_module_id" text not null,
  "c_command_id" text not null,
  "c_action" text not null,
  "c_binding_digest" text not null,
  "c_decision" text not null,
  "c_retention_until" ${integerType} not null,
  unique ("c_module_id", "c_command_id")
)`);
  yield* sql.unsafe(`create table "app_proof_requests" (
  "c_module_id" text not null,
  "c_request_id" text not null,
  "c_fingerprint" text not null,
  "c_proof_id" text not null,
  "c_purpose" text not null,
  "c_key_id" text not null,
  "c_created_at" ${integerType} not null,
  "c_retention_until" ${integerType} not null,
  "c_receipt" text not null,
  unique ("c_module_id", "c_request_id")
)`);
  yield* sql.unsafe(`create table "app_proof_series" (
  "c_module_id" text not null,
  "c_purpose" text not null,
  "c_scope_key" text not null,
  "c_active_proof_id" text,
  "c_last_issue_at" ${integerType},
  "c_version" text not null,
  unique ("c_module_id", "c_purpose", "c_scope_key")
)`);
  yield* sql.unsafe(`create table "app_proof_generations" (
  "c_module_id" text not null,
  "c_purpose" text not null,
  "c_proof_id" text not null,
  "c_request_id" text not null,
  "c_series_key" text not null,
  "c_delivery_id" text not null,
  "c_binding" text not null,
  "c_verifier_key_id" text not null,
  "c_verifier_digest" text not null,
  "c_issued_at" ${integerType} not null,
  "c_expires_at" ${integerType} not null,
  "c_version" text not null,
  "c_state" text not null,
  "c_send_count" ${integerType} not null,
  "c_delivery_state" text not null,
  "c_claim_version" text,
  "c_claim_deadline" ${integerType},
  "c_retry_at" ${integerType},
  "c_delivery_retry_millis" ${integerType} not null,
  "c_retention_until" ${integerType} not null,
  "c_fingerprint" text not null,
  unique ("c_module_id", "c_proof_id"),
  unique ("c_module_id", "c_delivery_id")
)`);
  yield* sql.unsafe(`create table "app_proof_continuations" (
  "c_module_id" text not null,
  "c_purpose" text not null,
  "c_continuation_id" text not null,
  "c_digest" text not null,
  "c_proof_id" text not null,
  "c_series_key" text not null,
  "c_binding" text not null,
  "c_expires_at" ${integerType} not null,
  "c_consumed" ${booleanType} not null,
  "c_version" text not null,
  "c_retention_until" ${integerType} not null,
  unique ("c_module_id", "c_continuation_id"),
  unique ("c_module_id", "c_digest")
)`);
  yield* sql.unsafe(`create table "app_proof_scopes" (
  "c_module_id" text not null,
  "c_purpose" text not null,
  "c_action" text not null,
  "c_scope_kind" text not null,
  "c_scope_key" text not null,
  unique ("c_module_id", "c_purpose", "c_action", "c_scope_kind", "c_scope_key")
)`);
  yield* sql.unsafe(`create table "app_proof_abuse" (
  "c_module_id" text not null,
  "c_purpose" text not null,
  "c_action" text not null,
  "c_scope_kind" text not null,
  "c_scope_key" text not null,
  "c_command_id" text not null,
  "c_occurred_at" ${integerType} not null,
  "c_retention_until" ${integerType} not null,
  unique ("c_module_id", "c_action", "c_scope_kind", "c_scope_key", "c_command_id")
)`);
  yield* sql.unsafe(`create table "app_proof_failures" (
  "c_module_id" text not null,
  "c_purpose" text not null,
  "c_series_key" text not null,
  "c_command_id" text not null,
  "c_occurred_at" ${integerType} not null,
  "c_retention_until" ${integerType} not null,
  unique ("c_module_id", "c_series_key", "c_command_id")
)`);
  yield* sql.unsafe(`create table "app_proof_commands" (
  "c_module_id" text not null,
  "c_command_id" text not null,
  "c_kind" text not null,
  "c_decision" text not null,
  "c_retention_until" ${integerType} not null,
  unique ("c_module_id", "c_command_id")
)`);
  yield* sql.unsafe(`create table "app_sessions" (
  "c_session_id" text not null,
  "c_subject_id" text not null,
  "c_digest" text not null,
  "c_version" text not null,
  "c_security_revision" text not null,
  "c_issued_at" ${integerType} not null,
  "c_expires_at" ${integerType} not null,
  "c_absolute_expires_at" ${integerType} not null,
  "c_record" text not null,
  unique ("c_session_id"),
  unique ("c_digest")
)`);
  yield* sql.unsafe(`create table "app_session_flows" (
  "c_flow_id" text not null,
  "c_subject_id" text not null,
  "c_state" text not null,
  "c_pending_digest" text,
  "c_dedup_until" ${integerType} not null,
  unique ("c_flow_id")
)`);
});

const account = Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient;
  const booleanType = sql.onDialectOrElse({ pg: () => "boolean", orElse: () => "integer" });
  const integerType = sql.onDialectOrElse({ pg: () => "bigint", orElse: () => "integer" });

  yield* sql.unsafe(`create table "app_password_registrations" (
  "c_module_id" text not null,
  "c_request_id" text not null,
  unique ("c_module_id", "c_request_id")
)`);
  yield* sql.unsafe(`create table "app_email_credentials" (
  "c_module_id" text not null,
  "c_subject_id" text not null,
  "c_credential_id" text not null,
  "c_identifier_namespace" text not null,
  "c_identifier_value" text not null,
  "c_credential_revision" text not null,
  "c_active" ${booleanType} not null,
  unique ("c_module_id", "c_credential_id"),
  unique ("c_module_id", "c_identifier_namespace", "c_identifier_value")
)`);
  yield* sql.unsafe(`create table "app_email_commands" (
  "c_module_id" text not null,
  "c_command_id" text not null,
  "c_action" text not null,
  "c_binding_digest" text not null,
  "c_retention_until" ${integerType} not null,
  unique ("c_module_id", "c_command_id")
)`);
});

const passkey = Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient;
  const booleanType = sql.onDialectOrElse({ pg: () => "boolean", orElse: () => "integer" });
  const integerType = sql.onDialectOrElse({ pg: () => "bigint", orElse: () => "integer" });

  yield* sql.unsafe(`create table "app_passkey_credentials" (
  "c_credential_id" text not null,
  "c_subject_id" text not null,
  "c_rp_id" text not null,
  "c_protocol_credential_id" text not null,
  "c_credential_key" text not null,
  "c_handle_key" text not null,
  "c_user_handle" text not null,
  "c_public_key" text not null,
  "c_algorithm" ${integerType} not null,
  "c_profile" text not null,
  "c_credential_revision" text not null,
  "c_active" ${booleanType} not null,
  "c_primary_sign_in" ${booleanType} not null,
  "c_enrollment_user_verified" ${booleanType} not null,
  "c_backup_eligible" ${booleanType} not null,
  "c_backup_state" ${booleanType} not null,
  "c_counter" ${integerType} not null,
  "c_maximum_counter" ${integerType} not null,
  "c_name" text not null,
  "c_created_at" ${integerType} not null,
  "c_last_used_at" ${integerType},
  unique ("c_credential_id"),
  unique ("c_credential_key")
)`);
  yield* sql.unsafe(`create table "app_passkey_ownership" (
  "c_credential_key" text not null,
  "c_rp_id" text not null,
  "c_protocol_credential_id" text not null,
  "c_subject_id" text,
  "c_credential_id" text,
  "c_state" text not null,
  "c_version" text not null,
  "c_reservation_id" text,
  unique ("c_credential_key")
)`);
  yield* sql.unsafe(`create table "app_passkey_handles" (
  "c_handle_key" text not null,
  "c_rp_id" text not null,
  "c_user_handle" text not null,
  "c_subject_id" text,
  "c_state" text not null,
  "c_version" text not null,
  "c_reservation_id" text,
  unique ("c_handle_key"),
  unique ("c_rp_id", "c_subject_id")
)`);
  yield* sql.unsafe(`create table "app_passkey_modules" (
  "c_module_id" text not null,
  "c_active" ${booleanType} not null,
  "c_policy_revision" text not null,
  "c_policy" text not null,
  unique ("c_module_id")
)`);
  yield* sql.unsafe(`create table "app_passkey_flows" (
  "c_module_id" text not null,
  "c_flow_id" text not null,
  "c_command_id" text not null,
  "c_purpose" text not null,
  "c_state" text not null,
  "c_version" text not null,
  "c_generation" ${integerType} not null,
  "c_snapshot" text not null,
  "c_policy_snapshot" text not null,
  "c_request_binding_verifier" text not null,
  "c_request_binding_expires_at" ${integerType} not null,
  "c_issued_at" ${integerType} not null,
  "c_expires_at" ${integerType} not null,
  "c_retention_until" ${integerType} not null,
  "c_claim_id" text,
  "c_claimed_at" ${integerType},
  "c_claim_expires_at" ${integerType},
  "c_credential_snapshot" text,
  "c_subject_scope" text,
  "c_target_scope" text,
  unique ("c_module_id", "c_flow_id"),
  unique ("c_module_id", "c_command_id")
)`);
  yield* sql.unsafe(`create table "app_passkey_admissions" (
  "c_authority_scope" text not null,
  "c_module_id" text not null,
  "c_version" text not null,
  "c_owner_marker" text not null,
  "c_admitted_at" ${integerType},
  unique ("c_authority_scope", "c_module_id")
)`);
  yield* sql.unsafe(`create table "app_passkey_charges" (
  "c_module_id" text not null,
  "c_flow_id" text not null,
  "c_purpose" text not null,
  "c_kind" text not null,
  "c_scope" text not null,
  "c_original_window_millis" ${integerType} not null,
  "c_admitted_at" ${integerType},
  "c_retain_until" ${integerType},
  "c_version" text not null,
  "c_owner_marker" text not null,
  unique ("c_module_id", "c_flow_id", "c_kind")
)`);
  yield* sql.unsafe(`create table "app_passkey_commands" (
  "c_module_id" text not null,
  "c_command_id" text not null,
  "c_subject_id" text not null,
  "c_credential_id" text not null,
  "c_intent" text not null,
  "c_decision" text not null,
  "c_retention_until" ${integerType} not null,
  "c_version" text not null,
  unique ("c_module_id", "c_command_id")
)`);
});

export const MigrationsLive = Layer.effectDiscard(
  Migrator.make({})({
    table: "customer_migrations",
    loader: Migrator.fromRecord({
      "0001_customers_and_auth": initial,
      "0002_registration_and_email": account,
      "0003_passkeys": passkey,
      "0004_browser_login": Effect.flatMap(SqlClient.SqlClient, (sql) =>
        sql.unsafe(BrowserLoginPersistence.migration),
      ),
    }),
  }),
);
