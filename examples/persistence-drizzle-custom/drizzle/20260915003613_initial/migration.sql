CREATE TABLE `app_credentials` (
	`c_credential_id` text NOT NULL,
	`c_subject_id` text NOT NULL,
	`c_revision` text NOT NULL,
	`c_active` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `customers` (
	`customer_key` text PRIMARY KEY,
	`enabled` integer NOT NULL,
	`auth_revision` text NOT NULL,
	`display_name` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `app_email_commands` (
	`c_module_id` text NOT NULL,
	`c_command_id` text NOT NULL,
	`c_action` text NOT NULL,
	`c_binding_digest` text NOT NULL,
	`c_retention_until` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `app_email_credentials` (
	`c_module_id` text NOT NULL,
	`c_subject_id` text NOT NULL,
	`c_credential_id` text NOT NULL,
	`c_identifier_namespace` text NOT NULL,
	`c_identifier_value` text NOT NULL,
	`c_credential_revision` text NOT NULL,
	`c_active` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `app_identifiers` (
	`c_namespace` text NOT NULL,
	`c_value` text NOT NULL,
	`c_subject_id` text NOT NULL,
	`c_revision` text NOT NULL,
	`c_verified_at` integer,
	`c_active` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `app_password_attempts` (
	`c_module_id` text NOT NULL,
	`c_action` text NOT NULL,
	`c_attempt_id` text NOT NULL,
	`c_identifier_namespace` text NOT NULL,
	`c_identifier_value` text NOT NULL,
	`c_subject_id` text,
	`c_credential_id` text,
	`c_security_revision` text,
	`c_credential_revision` text,
	`c_verifier_version` text,
	`c_identifier_binding_revision` text,
	`c_admitted_at` integer NOT NULL,
	`c_deadline` integer NOT NULL,
	`c_retention_until` integer NOT NULL,
	`c_state` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `app_password_charges` (
	`c_module_id` text NOT NULL,
	`c_action` text NOT NULL,
	`c_scope_kind` text NOT NULL,
	`c_scope_key` text NOT NULL,
	`c_attempt_id` text NOT NULL,
	`c_occurred_at` integer NOT NULL,
	`c_retention_until` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `app_password_commands` (
	`c_module_id` text NOT NULL,
	`c_command_id` text NOT NULL,
	`c_action` text NOT NULL,
	`c_binding_digest` text NOT NULL,
	`c_decision` text NOT NULL,
	`c_retention_until` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `app_password_registrations` (
	`c_module_id` text NOT NULL,
	`c_request_id` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `app_password_scopes` (
	`c_module_id` text NOT NULL,
	`c_action` text NOT NULL,
	`c_scope_kind` text NOT NULL,
	`c_scope_key` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `app_passwords` (
	`c_module_id` text NOT NULL,
	`c_subject_id` text NOT NULL,
	`c_credential_id` text NOT NULL,
	`c_credential_revision` text NOT NULL,
	`c_verifier_version` text NOT NULL,
	`c_verifier` text NOT NULL,
	`c_normalization` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `app_proof_abuse` (
	`c_module_id` text NOT NULL,
	`c_purpose` text NOT NULL,
	`c_action` text NOT NULL,
	`c_scope_kind` text NOT NULL,
	`c_scope_key` text NOT NULL,
	`c_command_id` text NOT NULL,
	`c_occurred_at` integer NOT NULL,
	`c_retention_until` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `app_proof_commands` (
	`c_module_id` text NOT NULL,
	`c_command_id` text NOT NULL,
	`c_kind` text NOT NULL,
	`c_decision` text NOT NULL,
	`c_retention_until` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `app_proof_continuations` (
	`c_module_id` text NOT NULL,
	`c_purpose` text NOT NULL,
	`c_continuation_id` text NOT NULL,
	`c_digest` text NOT NULL,
	`c_proof_id` text NOT NULL,
	`c_series_key` text NOT NULL,
	`c_binding` text NOT NULL,
	`c_expires_at` integer NOT NULL,
	`c_consumed` integer NOT NULL,
	`c_version` text NOT NULL,
	`c_retention_until` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `app_proof_failures` (
	`c_module_id` text NOT NULL,
	`c_purpose` text NOT NULL,
	`c_series_key` text NOT NULL,
	`c_command_id` text NOT NULL,
	`c_occurred_at` integer NOT NULL,
	`c_retention_until` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `app_proof_generations` (
	`c_module_id` text NOT NULL,
	`c_purpose` text NOT NULL,
	`c_proof_id` text NOT NULL,
	`c_request_id` text NOT NULL,
	`c_series_key` text NOT NULL,
	`c_delivery_id` text NOT NULL,
	`c_binding` text NOT NULL,
	`c_verifier_key_id` text NOT NULL,
	`c_verifier_digest` text NOT NULL,
	`c_issued_at` integer NOT NULL,
	`c_expires_at` integer NOT NULL,
	`c_version` text NOT NULL,
	`c_state` text NOT NULL,
	`c_send_count` integer NOT NULL,
	`c_delivery_state` text NOT NULL,
	`c_claim_version` text,
	`c_claim_deadline` integer,
	`c_retry_at` integer,
	`c_delivery_retry_millis` integer NOT NULL,
	`c_retention_until` integer NOT NULL,
	`c_fingerprint` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `app_proof_requests` (
	`c_module_id` text NOT NULL,
	`c_request_id` text NOT NULL,
	`c_fingerprint` text NOT NULL,
	`c_proof_id` text NOT NULL,
	`c_purpose` text NOT NULL,
	`c_key_id` text NOT NULL,
	`c_created_at` integer NOT NULL,
	`c_retention_until` integer NOT NULL,
	`c_receipt` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `app_proof_scopes` (
	`c_module_id` text NOT NULL,
	`c_purpose` text NOT NULL,
	`c_action` text NOT NULL,
	`c_scope_kind` text NOT NULL,
	`c_scope_key` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `app_proof_series` (
	`c_module_id` text NOT NULL,
	`c_purpose` text NOT NULL,
	`c_scope_key` text NOT NULL,
	`c_active_proof_id` text,
	`c_last_issue_at` integer,
	`c_version` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `app_session_flows` (
	`c_flow_id` text NOT NULL,
	`c_subject_id` text NOT NULL,
	`c_state` text NOT NULL,
	`c_pending_digest` text,
	`c_dedup_until` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `app_sessions` (
	`c_session_id` text NOT NULL,
	`c_subject_id` text NOT NULL,
	`c_digest` text NOT NULL,
	`c_version` text NOT NULL,
	`c_security_revision` text NOT NULL,
	`c_issued_at` integer NOT NULL,
	`c_expires_at` integer NOT NULL,
	`c_absolute_expires_at` integer NOT NULL,
	`c_record` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `app_passkey_admissions` (
	`c_authority_scope` text NOT NULL,
	`c_module_id` text NOT NULL,
	`c_version` text NOT NULL,
	`c_owner_marker` text NOT NULL,
	`c_admitted_at` integer
);
--> statement-breakpoint
CREATE TABLE `app_passkey_charges` (
	`c_module_id` text NOT NULL,
	`c_flow_id` text NOT NULL,
	`c_purpose` text NOT NULL,
	`c_kind` text NOT NULL,
	`c_scope` text NOT NULL,
	`c_original_window_millis` integer NOT NULL,
	`c_admitted_at` integer,
	`c_retain_until` integer,
	`c_version` text NOT NULL,
	`c_owner_marker` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `app_passkey_commands` (
	`c_module_id` text NOT NULL,
	`c_command_id` text NOT NULL,
	`c_subject_id` text NOT NULL,
	`c_credential_id` text NOT NULL,
	`c_intent` text NOT NULL,
	`c_decision` text NOT NULL,
	`c_retention_until` integer NOT NULL,
	`c_version` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `app_passkey_credentials` (
	`c_credential_id` text NOT NULL,
	`c_subject_id` text NOT NULL,
	`c_rp_id` text NOT NULL,
	`c_protocol_credential_id` text NOT NULL,
	`c_credential_key` text NOT NULL,
	`c_handle_key` text NOT NULL,
	`c_user_handle` text NOT NULL,
	`c_public_key` text NOT NULL,
	`c_algorithm` integer NOT NULL,
	`c_profile` text NOT NULL,
	`c_credential_revision` text NOT NULL,
	`c_active` integer NOT NULL,
	`c_primary_sign_in` integer NOT NULL,
	`c_enrollment_user_verified` integer NOT NULL,
	`c_backup_eligible` integer NOT NULL,
	`c_backup_state` integer NOT NULL,
	`c_counter` integer NOT NULL,
	`c_maximum_counter` integer NOT NULL,
	`c_name` text NOT NULL,
	`c_created_at` integer NOT NULL,
	`c_last_used_at` integer
);
--> statement-breakpoint
CREATE TABLE `app_passkey_flows` (
	`c_module_id` text NOT NULL,
	`c_flow_id` text NOT NULL,
	`c_command_id` text NOT NULL,
	`c_purpose` text NOT NULL,
	`c_state` text NOT NULL,
	`c_version` text NOT NULL,
	`c_generation` integer NOT NULL,
	`c_snapshot` text NOT NULL,
	`c_policy_snapshot` text NOT NULL,
	`c_request_binding_verifier` text NOT NULL,
	`c_request_binding_expires_at` integer NOT NULL,
	`c_issued_at` integer NOT NULL,
	`c_expires_at` integer NOT NULL,
	`c_retention_until` integer NOT NULL,
	`c_claim_id` text,
	`c_claimed_at` integer,
	`c_claim_expires_at` integer,
	`c_credential_snapshot` text,
	`c_subject_scope` text,
	`c_target_scope` text
);
--> statement-breakpoint
CREATE TABLE `app_passkey_handles` (
	`c_handle_key` text NOT NULL,
	`c_rp_id` text NOT NULL,
	`c_user_handle` text NOT NULL,
	`c_subject_id` text,
	`c_state` text NOT NULL,
	`c_version` text NOT NULL,
	`c_reservation_id` text
);
--> statement-breakpoint
CREATE TABLE `app_passkey_modules` (
	`c_module_id` text NOT NULL,
	`c_active` integer NOT NULL,
	`c_policy_revision` text NOT NULL,
	`c_policy` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `app_passkey_ownership` (
	`c_credential_key` text NOT NULL,
	`c_rp_id` text NOT NULL,
	`c_protocol_credential_id` text NOT NULL,
	`c_subject_id` text,
	`c_credential_id` text,
	`c_state` text NOT NULL,
	`c_version` text NOT NULL,
	`c_reservation_id` text
);
--> statement-breakpoint
CREATE UNIQUE INDEX `app_credentials_key_0` ON `app_credentials` (`c_credential_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `app_email_commands_key_0` ON `app_email_commands` (`c_module_id`,`c_command_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `app_email_credentials_key_0` ON `app_email_credentials` (`c_module_id`,`c_credential_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `app_email_credentials_key_1` ON `app_email_credentials` (`c_module_id`,`c_identifier_namespace`,`c_identifier_value`);--> statement-breakpoint
CREATE UNIQUE INDEX `app_identifiers_key_0` ON `app_identifiers` (`c_namespace`,`c_value`);--> statement-breakpoint
CREATE UNIQUE INDEX `app_password_attempts_key_0` ON `app_password_attempts` (`c_module_id`,`c_attempt_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `app_password_charges_key_0` ON `app_password_charges` (`c_module_id`,`c_action`,`c_scope_kind`,`c_scope_key`,`c_attempt_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `app_password_commands_key_0` ON `app_password_commands` (`c_module_id`,`c_command_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `app_password_registrations_key_0` ON `app_password_registrations` (`c_module_id`,`c_request_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `app_password_scopes_key_0` ON `app_password_scopes` (`c_module_id`,`c_action`,`c_scope_kind`,`c_scope_key`);--> statement-breakpoint
CREATE UNIQUE INDEX `app_passwords_key_0` ON `app_passwords` (`c_module_id`,`c_subject_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `app_passwords_key_1` ON `app_passwords` (`c_module_id`,`c_credential_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `app_proof_abuse_key_0` ON `app_proof_abuse` (`c_module_id`,`c_action`,`c_scope_kind`,`c_scope_key`,`c_command_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `app_proof_commands_key_0` ON `app_proof_commands` (`c_module_id`,`c_command_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `app_proof_continuations_key_0` ON `app_proof_continuations` (`c_module_id`,`c_continuation_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `app_proof_continuations_key_1` ON `app_proof_continuations` (`c_module_id`,`c_digest`);--> statement-breakpoint
CREATE UNIQUE INDEX `app_proof_failures_key_0` ON `app_proof_failures` (`c_module_id`,`c_series_key`,`c_command_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `app_proof_generations_key_0` ON `app_proof_generations` (`c_module_id`,`c_proof_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `app_proof_generations_key_1` ON `app_proof_generations` (`c_module_id`,`c_delivery_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `app_proof_requests_key_0` ON `app_proof_requests` (`c_module_id`,`c_request_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `app_proof_scopes_key_0` ON `app_proof_scopes` (`c_module_id`,`c_purpose`,`c_action`,`c_scope_kind`,`c_scope_key`);--> statement-breakpoint
CREATE UNIQUE INDEX `app_proof_series_key_0` ON `app_proof_series` (`c_module_id`,`c_purpose`,`c_scope_key`);--> statement-breakpoint
CREATE UNIQUE INDEX `app_session_flows_key_0` ON `app_session_flows` (`c_flow_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `app_sessions_key_0` ON `app_sessions` (`c_session_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `app_sessions_key_1` ON `app_sessions` (`c_digest`);--> statement-breakpoint
CREATE UNIQUE INDEX `app_passkey_admissions_key_0` ON `app_passkey_admissions` (`c_authority_scope`,`c_module_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `app_passkey_charges_key_0` ON `app_passkey_charges` (`c_module_id`,`c_flow_id`,`c_kind`);--> statement-breakpoint
CREATE UNIQUE INDEX `app_passkey_commands_key_0` ON `app_passkey_commands` (`c_module_id`,`c_command_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `app_passkey_credentials_key_0` ON `app_passkey_credentials` (`c_credential_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `app_passkey_credentials_key_1` ON `app_passkey_credentials` (`c_credential_key`);--> statement-breakpoint
CREATE UNIQUE INDEX `app_passkey_flows_key_0` ON `app_passkey_flows` (`c_module_id`,`c_flow_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `app_passkey_flows_key_1` ON `app_passkey_flows` (`c_module_id`,`c_command_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `app_passkey_handles_key_0` ON `app_passkey_handles` (`c_handle_key`);--> statement-breakpoint
CREATE UNIQUE INDEX `app_passkey_handles_key_1` ON `app_passkey_handles` (`c_rp_id`,`c_subject_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `app_passkey_modules_key_0` ON `app_passkey_modules` (`c_module_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `app_passkey_ownership_key_0` ON `app_passkey_ownership` (`c_credential_key`);