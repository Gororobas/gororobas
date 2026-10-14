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
	`c_module_id` text,
	`c_credential_id` text,
	`c_namespace` text NOT NULL,
	`c_value` text NOT NULL,
	`c_subject_id` text NOT NULL,
	`c_revision` text NOT NULL,
	`c_verified_at` integer,
	`c_active` integer NOT NULL
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
CREATE TABLE `app_sessions` (
	`c_session_id` text NOT NULL,
	`c_subject_id` text NOT NULL,
	`c_digest` text NOT NULL,
	`c_security_revision` text NOT NULL,
	`c_issued_at` integer NOT NULL,
	`c_expires_at` integer NOT NULL,
	`c_absolute_expires_at` integer NOT NULL,
	`c_record` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `app_passkey_credentials` (
	`c_credential_id` text NOT NULL,
	`c_subject_id` text NOT NULL,
	`c_rp_id` text NOT NULL,
	`c_protocol_credential_id` text NOT NULL,
	`c_credential_key` text NOT NULL,
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
	`c_name` text NOT NULL,
	`c_created_at` integer NOT NULL,
	`c_last_used_at` integer
);
--> statement-breakpoint
CREATE TABLE `app_passkey_flows` (
	`c_module_id` text NOT NULL,
	`c_flow_id` text NOT NULL,
	`c_purpose` text NOT NULL,
	`c_snapshot` text NOT NULL,
	`c_request_binding_verifier` text NOT NULL,
	`c_request_binding_expires_at` integer NOT NULL,
	`c_issued_at` integer NOT NULL,
	`c_expires_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `app_credentials_key_0` ON `app_credentials` (`c_credential_id`);
--> statement-breakpoint
CREATE UNIQUE INDEX `app_email_credentials_key_0` ON `app_email_credentials` (`c_module_id`,`c_credential_id`);
--> statement-breakpoint
CREATE UNIQUE INDEX `app_email_credentials_key_1` ON `app_email_credentials` (`c_module_id`,`c_identifier_namespace`,`c_identifier_value`);
--> statement-breakpoint
CREATE UNIQUE INDEX `app_identifiers_key_0` ON `app_identifiers` (`c_namespace`,`c_value`);
--> statement-breakpoint
CREATE UNIQUE INDEX `app_passwords_key_0` ON `app_passwords` (`c_module_id`,`c_subject_id`);
--> statement-breakpoint
CREATE UNIQUE INDEX `app_passwords_key_1` ON `app_passwords` (`c_module_id`,`c_credential_id`);
--> statement-breakpoint
CREATE UNIQUE INDEX `app_sessions_key_0` ON `app_sessions` (`c_session_id`);
--> statement-breakpoint
CREATE UNIQUE INDEX `app_sessions_key_1` ON `app_sessions` (`c_digest`);
--> statement-breakpoint
CREATE UNIQUE INDEX `app_passkey_credentials_key_0` ON `app_passkey_credentials` (`c_credential_id`);
--> statement-breakpoint
CREATE UNIQUE INDEX `app_passkey_credentials_key_1` ON `app_passkey_credentials` (`c_credential_key`);
--> statement-breakpoint
CREATE UNIQUE INDEX `app_passkey_flows_key_0` ON `app_passkey_flows` (`c_module_id`,`c_flow_id`);
--> statement-breakpoint
CREATE UNIQUE INDEX `app_passkey_ownership_key_0` ON `app_passkey_ownership` (`c_credential_key`);
--> statement-breakpoint
CREATE TABLE `app_proofs` (
	`c_module_id` text NOT NULL,
	`c_purpose` text NOT NULL,
	`c_series_key` text NOT NULL,
	`c_proof_id` text NOT NULL,
	`c_binding` text NOT NULL,
	`c_verifier_key_id` text NOT NULL,
	`c_verifier_digest` text NOT NULL,
	`c_issued_at` integer NOT NULL,
	`c_expires_at` integer NOT NULL,
	`c_failed_attempts` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `app_proofs_key_0` ON `app_proofs` (`c_module_id`,`c_purpose`,`c_series_key`);
--> statement-breakpoint
CREATE UNIQUE INDEX `app_proofs_key_1` ON `app_proofs` (`c_module_id`,`c_proof_id`);

--> statement-breakpoint
CREATE TABLE `app_pending` (
	`c_module_id` text NOT NULL,
	`c_kind` text NOT NULL,
	`c_digest` text NOT NULL,
	`c_version` text NOT NULL,
	`c_flow_id` text NOT NULL,
	`c_subject_id` text NOT NULL,
	`c_binding_digest` text NOT NULL,
	`c_snapshot` text NOT NULL,
	`c_expires_at` integer NOT NULL,
	`c_attempt_limit` integer NOT NULL,
	`c_failed_attempts` integer NOT NULL,
	`c_consumed` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `app_pending_key_0` ON `app_pending` (`c_digest`);
