CREATE TABLE `customer_auth_credentials` (
	`credential_id` text NOT NULL,
	`subject_id` text NOT NULL,
	`revision` text NOT NULL,
	`active` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `customers` (
	`customer_key` text PRIMARY KEY,
	`enabled` integer NOT NULL,
	`auth_revision` text NOT NULL,
	`display_name` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `customer_auth_emailCommands` (
	`module_id` text NOT NULL,
	`command_id` text NOT NULL,
	`action` text NOT NULL,
	`binding_digest` text NOT NULL,
	`retention_until` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `customer_auth_emailCredentials` (
	`module_id` text NOT NULL,
	`subject_id` text NOT NULL,
	`credential_id` text NOT NULL,
	`identifier_namespace` text NOT NULL,
	`identifier_value` text NOT NULL,
	`credential_revision` text NOT NULL,
	`active` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `customer_auth_identifiers` (
	`namespace` text NOT NULL,
	`value` text NOT NULL,
	`subject_id` text NOT NULL,
	`revision` text NOT NULL,
	`verified_at` integer,
	`active` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `customer_auth_passkeyAdmissions` (
	`authority_scope` text NOT NULL,
	`module_id` text NOT NULL,
	`version` text NOT NULL,
	`owner_marker` text NOT NULL,
	`admitted_at` integer
);
--> statement-breakpoint
CREATE TABLE `customer_auth_passkeyCharges` (
	`module_id` text NOT NULL,
	`flow_id` text NOT NULL,
	`purpose` text NOT NULL,
	`kind` text NOT NULL,
	`scope` text NOT NULL,
	`original_window_millis` integer NOT NULL,
	`admitted_at` integer,
	`retain_until` integer,
	`version` text NOT NULL,
	`owner_marker` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `customer_auth_passkeyCommands` (
	`module_id` text NOT NULL,
	`command_id` text NOT NULL,
	`subject_id` text NOT NULL,
	`credential_id` text NOT NULL,
	`intent` text NOT NULL,
	`decision` text NOT NULL,
	`retention_until` integer NOT NULL,
	`version` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `customer_auth_passkeyCredentials` (
	`credential_id` text NOT NULL,
	`subject_id` text NOT NULL,
	`rp_id` text NOT NULL,
	`protocol_credential_id` text NOT NULL,
	`credential_key` text NOT NULL,
	`handle_key` text NOT NULL,
	`user_handle` text NOT NULL,
	`public_key` text NOT NULL,
	`algorithm` integer NOT NULL,
	`profile` text NOT NULL,
	`credential_revision` text NOT NULL,
	`active` integer NOT NULL,
	`primary_sign_in` integer NOT NULL,
	`enrollment_user_verified` integer NOT NULL,
	`backup_eligible` integer NOT NULL,
	`backup_state` integer NOT NULL,
	`counter` integer NOT NULL,
	`maximum_counter` integer NOT NULL,
	`name` text NOT NULL,
	`created_at` integer NOT NULL,
	`last_used_at` integer
);
--> statement-breakpoint
CREATE TABLE `customer_auth_passkeyFlows` (
	`module_id` text NOT NULL,
	`flow_id` text NOT NULL,
	`command_id` text NOT NULL,
	`purpose` text NOT NULL,
	`state` text NOT NULL,
	`version` text NOT NULL,
	`generation` integer NOT NULL,
	`snapshot` text NOT NULL,
	`policy_snapshot` text NOT NULL,
	`request_binding_verifier` text NOT NULL,
	`request_binding_expires_at` integer NOT NULL,
	`issued_at` integer NOT NULL,
	`expires_at` integer NOT NULL,
	`retention_until` integer NOT NULL,
	`claim_id` text,
	`claimed_at` integer,
	`claim_expires_at` integer,
	`credential_snapshot` text,
	`subject_scope` text,
	`target_scope` text
);
--> statement-breakpoint
CREATE TABLE `customer_auth_passkeyHandles` (
	`handle_key` text NOT NULL,
	`rp_id` text NOT NULL,
	`user_handle` text NOT NULL,
	`subject_id` text,
	`state` text NOT NULL,
	`version` text NOT NULL,
	`reservation_id` text
);
--> statement-breakpoint
CREATE TABLE `customer_auth_passkeyModules` (
	`module_id` text NOT NULL,
	`active` integer NOT NULL,
	`policy_revision` text NOT NULL,
	`policy` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `customer_auth_passkeyOwnership` (
	`credential_key` text NOT NULL,
	`rp_id` text NOT NULL,
	`protocol_credential_id` text NOT NULL,
	`subject_id` text,
	`credential_id` text,
	`state` text NOT NULL,
	`version` text NOT NULL,
	`reservation_id` text
);
--> statement-breakpoint
CREATE TABLE `customer_auth_passwordAttempts` (
	`module_id` text NOT NULL,
	`action` text NOT NULL,
	`attempt_id` text NOT NULL,
	`identifier_namespace` text NOT NULL,
	`identifier_value` text NOT NULL,
	`subject_id` text,
	`credential_id` text,
	`security_revision` text,
	`credential_revision` text,
	`verifier_version` text,
	`identifier_binding_revision` text,
	`admitted_at` integer NOT NULL,
	`deadline` integer NOT NULL,
	`retention_until` integer NOT NULL,
	`state` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `customer_auth_passwordCharges` (
	`module_id` text NOT NULL,
	`action` text NOT NULL,
	`scope_kind` text NOT NULL,
	`scope_key` text NOT NULL,
	`attempt_id` text NOT NULL,
	`occurred_at` integer NOT NULL,
	`retention_until` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `customer_auth_passwordCommands` (
	`module_id` text NOT NULL,
	`command_id` text NOT NULL,
	`action` text NOT NULL,
	`binding_digest` text NOT NULL,
	`decision` text NOT NULL,
	`retention_until` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `customer_auth_passwordRegistrations` (
	`module_id` text NOT NULL,
	`request_id` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `customer_auth_passwordScopes` (
	`module_id` text NOT NULL,
	`action` text NOT NULL,
	`scope_kind` text NOT NULL,
	`scope_key` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `customer_auth_passwords` (
	`module_id` text NOT NULL,
	`subject_id` text NOT NULL,
	`credential_id` text NOT NULL,
	`credential_revision` text NOT NULL,
	`verifier_version` text NOT NULL,
	`verifier` text NOT NULL,
	`normalization` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `customer_auth_proofAbuse` (
	`module_id` text NOT NULL,
	`purpose` text NOT NULL,
	`action` text NOT NULL,
	`scope_kind` text NOT NULL,
	`scope_key` text NOT NULL,
	`command_id` text NOT NULL,
	`occurred_at` integer NOT NULL,
	`retention_until` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `customer_auth_proofCommands` (
	`module_id` text NOT NULL,
	`command_id` text NOT NULL,
	`kind` text NOT NULL,
	`decision` text NOT NULL,
	`retention_until` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `customer_auth_proofContinuations` (
	`module_id` text NOT NULL,
	`purpose` text NOT NULL,
	`continuation_id` text NOT NULL,
	`digest` text NOT NULL,
	`proof_id` text NOT NULL,
	`series_key` text NOT NULL,
	`binding` text NOT NULL,
	`expires_at` integer NOT NULL,
	`consumed` integer NOT NULL,
	`version` text NOT NULL,
	`retention_until` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `customer_auth_proofFailures` (
	`module_id` text NOT NULL,
	`purpose` text NOT NULL,
	`series_key` text NOT NULL,
	`command_id` text NOT NULL,
	`occurred_at` integer NOT NULL,
	`retention_until` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `customer_auth_proofGenerations` (
	`module_id` text NOT NULL,
	`purpose` text NOT NULL,
	`proof_id` text NOT NULL,
	`request_id` text NOT NULL,
	`series_key` text NOT NULL,
	`delivery_id` text NOT NULL,
	`binding` text NOT NULL,
	`verifier_key_id` text NOT NULL,
	`verifier_digest` text NOT NULL,
	`issued_at` integer NOT NULL,
	`expires_at` integer NOT NULL,
	`version` text NOT NULL,
	`state` text NOT NULL,
	`send_count` integer NOT NULL,
	`delivery_state` text NOT NULL,
	`claim_version` text,
	`claim_deadline` integer,
	`retry_at` integer,
	`delivery_retry_millis` integer NOT NULL,
	`retention_until` integer NOT NULL,
	`fingerprint` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `customer_auth_proofRequests` (
	`module_id` text NOT NULL,
	`request_id` text NOT NULL,
	`fingerprint` text NOT NULL,
	`proof_id` text NOT NULL,
	`purpose` text NOT NULL,
	`key_id` text NOT NULL,
	`created_at` integer NOT NULL,
	`retention_until` integer NOT NULL,
	`receipt` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `customer_auth_proofScopes` (
	`module_id` text NOT NULL,
	`purpose` text NOT NULL,
	`action` text NOT NULL,
	`scope_kind` text NOT NULL,
	`scope_key` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `customer_auth_proofSeries` (
	`module_id` text NOT NULL,
	`purpose` text NOT NULL,
	`scope_key` text NOT NULL,
	`active_proof_id` text,
	`last_issue_at` integer,
	`version` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `customer_auth_sessionFlows` (
	`flow_id` text NOT NULL,
	`subject_id` text NOT NULL,
	`state` text NOT NULL,
	`pending_digest` text,
	`dedup_until` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `customer_auth_sessions` (
	`session_id` text NOT NULL,
	`subject_id` text NOT NULL,
	`digest` text NOT NULL,
	`version` text NOT NULL,
	`security_revision` text NOT NULL,
	`issued_at` integer NOT NULL,
	`expires_at` integer NOT NULL,
	`absolute_expires_at` integer NOT NULL,
	`record` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `customer_auth_credentials_key_0` ON `customer_auth_credentials` (`credential_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `customer_auth_emailCommands_key_0` ON `customer_auth_emailCommands` (`module_id`,`command_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `customer_auth_emailCredentials_key_0` ON `customer_auth_emailCredentials` (`module_id`,`credential_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `customer_auth_emailCredentials_key_1` ON `customer_auth_emailCredentials` (`module_id`,`identifier_namespace`,`identifier_value`);--> statement-breakpoint
CREATE UNIQUE INDEX `customer_auth_identifiers_key_0` ON `customer_auth_identifiers` (`namespace`,`value`);--> statement-breakpoint
CREATE UNIQUE INDEX `customer_auth_passkeyAdmissions_key_0` ON `customer_auth_passkeyAdmissions` (`authority_scope`,`module_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `customer_auth_passkeyCharges_key_0` ON `customer_auth_passkeyCharges` (`module_id`,`flow_id`,`kind`);--> statement-breakpoint
CREATE UNIQUE INDEX `customer_auth_passkeyCommands_key_0` ON `customer_auth_passkeyCommands` (`module_id`,`command_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `customer_auth_passkeyCredentials_key_0` ON `customer_auth_passkeyCredentials` (`credential_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `customer_auth_passkeyCredentials_key_1` ON `customer_auth_passkeyCredentials` (`credential_key`);--> statement-breakpoint
CREATE UNIQUE INDEX `customer_auth_passkeyFlows_key_0` ON `customer_auth_passkeyFlows` (`module_id`,`flow_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `customer_auth_passkeyFlows_key_1` ON `customer_auth_passkeyFlows` (`module_id`,`command_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `customer_auth_passkeyHandles_key_0` ON `customer_auth_passkeyHandles` (`handle_key`);--> statement-breakpoint
CREATE UNIQUE INDEX `customer_auth_passkeyHandles_key_1` ON `customer_auth_passkeyHandles` (`rp_id`,`subject_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `customer_auth_passkeyModules_key_0` ON `customer_auth_passkeyModules` (`module_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `customer_auth_passkeyOwnership_key_0` ON `customer_auth_passkeyOwnership` (`credential_key`);--> statement-breakpoint
CREATE UNIQUE INDEX `customer_auth_passwordAttempts_key_0` ON `customer_auth_passwordAttempts` (`module_id`,`attempt_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `customer_auth_passwordCharges_key_0` ON `customer_auth_passwordCharges` (`module_id`,`action`,`scope_kind`,`scope_key`,`attempt_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `customer_auth_passwordCommands_key_0` ON `customer_auth_passwordCommands` (`module_id`,`command_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `customer_auth_passwordRegistrations_key_0` ON `customer_auth_passwordRegistrations` (`module_id`,`request_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `customer_auth_passwordScopes_key_0` ON `customer_auth_passwordScopes` (`module_id`,`action`,`scope_kind`,`scope_key`);--> statement-breakpoint
CREATE UNIQUE INDEX `customer_auth_passwords_key_0` ON `customer_auth_passwords` (`module_id`,`subject_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `customer_auth_passwords_key_1` ON `customer_auth_passwords` (`module_id`,`credential_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `customer_auth_proofAbuse_key_0` ON `customer_auth_proofAbuse` (`module_id`,`action`,`scope_kind`,`scope_key`,`command_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `customer_auth_proofCommands_key_0` ON `customer_auth_proofCommands` (`module_id`,`command_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `customer_auth_proofContinuations_key_0` ON `customer_auth_proofContinuations` (`module_id`,`continuation_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `customer_auth_proofContinuations_key_1` ON `customer_auth_proofContinuations` (`module_id`,`digest`);--> statement-breakpoint
CREATE UNIQUE INDEX `customer_auth_proofFailures_key_0` ON `customer_auth_proofFailures` (`module_id`,`series_key`,`command_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `customer_auth_proofGenerations_key_0` ON `customer_auth_proofGenerations` (`module_id`,`proof_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `customer_auth_proofGenerations_key_1` ON `customer_auth_proofGenerations` (`module_id`,`delivery_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `customer_auth_proofRequests_key_0` ON `customer_auth_proofRequests` (`module_id`,`request_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `customer_auth_proofScopes_key_0` ON `customer_auth_proofScopes` (`module_id`,`purpose`,`action`,`scope_kind`,`scope_key`);--> statement-breakpoint
CREATE UNIQUE INDEX `customer_auth_proofSeries_key_0` ON `customer_auth_proofSeries` (`module_id`,`purpose`,`scope_key`);--> statement-breakpoint
CREATE UNIQUE INDEX `customer_auth_sessionFlows_key_0` ON `customer_auth_sessionFlows` (`flow_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `customer_auth_sessions_key_0` ON `customer_auth_sessions` (`session_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `customer_auth_sessions_key_1` ON `customer_auth_sessions` (`digest`);