CREATE INDEX `customer_auth_credentials_index_0` ON `customer_auth_credentials` (`subject_id`,`active`,`credential_id`);--> statement-breakpoint
CREATE INDEX `customer_auth_identifiers_index_0` ON `customer_auth_identifiers` (`subject_id`,`namespace`,`value`);--> statement-breakpoint
CREATE INDEX `customer_auth_pending_index_0` ON `customer_auth_pending` (`module_id`,`expires_at`,`digest`);--> statement-breakpoint
CREATE INDEX `customer_auth_sessions_index_0` ON `customer_auth_sessions` (`subject_id`,`security_revision`,`session_id`);