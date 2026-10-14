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
	`module_id` text,
	`credential_id` text,
	`namespace` text NOT NULL,
	`value` text NOT NULL,
	`subject_id` text NOT NULL,
	`revision` text NOT NULL,
	`verified_at` integer,
	`active` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `customer_auth_passkeyCredentials` (
	`credential_id` text NOT NULL,
	`subject_id` text NOT NULL,
	`rp_id` text NOT NULL,
	`protocol_credential_id` text NOT NULL,
	`credential_key` text NOT NULL,
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
	`name` text NOT NULL,
	`created_at` integer NOT NULL,
	`last_used_at` integer
);
--> statement-breakpoint
CREATE TABLE `customer_auth_passkeyFlows` (
	`module_id` text NOT NULL,
	`flow_id` text NOT NULL,
	`purpose` text NOT NULL,
	`snapshot` text NOT NULL,
	`request_binding_verifier` text NOT NULL,
	`request_binding_expires_at` integer NOT NULL,
	`issued_at` integer NOT NULL,
	`expires_at` integer NOT NULL
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
CREATE TABLE `customer_auth_sessions` (
	`session_id` text NOT NULL,
	`subject_id` text NOT NULL,
	`digest` text NOT NULL,
	`security_revision` text NOT NULL,
	`issued_at` integer NOT NULL,
	`expires_at` integer NOT NULL,
	`absolute_expires_at` integer NOT NULL,
	`record` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `customer_auth_credentials_key_0` ON `customer_auth_credentials` (`credential_id`);
--> statement-breakpoint
CREATE UNIQUE INDEX `customer_auth_emailCredentials_key_0` ON `customer_auth_emailCredentials` (`module_id`,`credential_id`);
--> statement-breakpoint
CREATE UNIQUE INDEX `customer_auth_emailCredentials_key_1` ON `customer_auth_emailCredentials` (`module_id`,`identifier_namespace`,`identifier_value`);
--> statement-breakpoint
CREATE UNIQUE INDEX `customer_auth_identifiers_key_0` ON `customer_auth_identifiers` (`namespace`,`value`);
--> statement-breakpoint
CREATE UNIQUE INDEX `customer_auth_passkeyCredentials_key_0` ON `customer_auth_passkeyCredentials` (`credential_id`);
--> statement-breakpoint
CREATE UNIQUE INDEX `customer_auth_passkeyCredentials_key_1` ON `customer_auth_passkeyCredentials` (`credential_key`);
--> statement-breakpoint
CREATE UNIQUE INDEX `customer_auth_passkeyFlows_key_0` ON `customer_auth_passkeyFlows` (`module_id`,`flow_id`);
--> statement-breakpoint
CREATE UNIQUE INDEX `customer_auth_passwords_key_0` ON `customer_auth_passwords` (`module_id`,`subject_id`);
--> statement-breakpoint
CREATE UNIQUE INDEX `customer_auth_passwords_key_1` ON `customer_auth_passwords` (`module_id`,`credential_id`);
--> statement-breakpoint
CREATE UNIQUE INDEX `customer_auth_sessions_key_0` ON `customer_auth_sessions` (`session_id`);
--> statement-breakpoint
CREATE UNIQUE INDEX `customer_auth_sessions_key_1` ON `customer_auth_sessions` (`digest`);
--> statement-breakpoint
CREATE TABLE `customer_auth_proofs` (
	`module_id` text NOT NULL,
	`purpose` text NOT NULL,
	`series_key` text NOT NULL,
	`proof_id` text NOT NULL,
	`binding` text NOT NULL,
	`verifier_key_id` text NOT NULL,
	`verifier_digest` text NOT NULL,
	`issued_at` integer NOT NULL,
	`expires_at` integer NOT NULL,
	`failed_attempts` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `customer_auth_proofs_key_0` ON `customer_auth_proofs` (`module_id`,`purpose`,`series_key`);
--> statement-breakpoint
CREATE UNIQUE INDEX `customer_auth_proofs_key_1` ON `customer_auth_proofs` (`module_id`,`proof_id`);

--> statement-breakpoint
CREATE TABLE `customer_auth_pending` (
	`module_id` text NOT NULL,
	`kind` text NOT NULL,
	`digest` text NOT NULL,
	`version` text NOT NULL,
	`flow_id` text NOT NULL,
	`subject_id` text NOT NULL,
	`binding_digest` text NOT NULL,
	`snapshot` text NOT NULL,
	`expires_at` integer NOT NULL,
	`attempt_limit` integer NOT NULL,
	`failed_attempts` integer NOT NULL,
	`consumed` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `customer_auth_pending_key_0` ON `customer_auth_pending` (`digest`);
