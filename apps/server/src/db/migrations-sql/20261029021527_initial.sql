-- Create "auth_subjects" table
CREATE TABLE `auth_subjects` (
  `id` text NOT NULL,
  `email` text NOT NULL,
  `is_email_verified` integer NOT NULL,
  `active` integer NOT NULL DEFAULT 1,
  `security_revision` text NOT NULL,
  `claimed_at` text NULL,
  `created_at` text NOT NULL,
  `updated_at` text NOT NULL,
  PRIMARY KEY (`id`)
);
-- Create index "auth_subjects_email" to table: "auth_subjects"
CREATE UNIQUE INDEX `auth_subjects_email` ON `auth_subjects` (`email`);
-- Create index "auth_subjects_unclaimed_idx" to table: "auth_subjects"
CREATE INDEX `auth_subjects_unclaimed_idx` ON `auth_subjects` (`created_at`) WHERE claimed_at IS NULL;
-- Create "auth_identifiers" table
CREATE TABLE `auth_identifiers` (
  `namespace` text NOT NULL,
  `value` text NOT NULL,
  `module_id` text NULL,
  `credential_id` text NULL,
  `auth_subject_id` text NOT NULL,
  `revision` text NOT NULL,
  `verified_at` integer NULL,
  `active` integer NOT NULL,
  CONSTRAINT `0` FOREIGN KEY (`auth_subject_id`) REFERENCES `auth_subjects` (`id`) ON UPDATE NO ACTION ON DELETE CASCADE
);
-- Create index "auth_identifiers_namespace_value" to table: "auth_identifiers"
CREATE UNIQUE INDEX `auth_identifiers_namespace_value` ON `auth_identifiers` (`namespace`, `value`);
-- Create "auth_credentials" table
CREATE TABLE `auth_credentials` (
  `credential_id` text NOT NULL,
  `auth_subject_id` text NOT NULL,
  `revision` text NOT NULL,
  `active` integer NOT NULL,
  CONSTRAINT `0` FOREIGN KEY (`auth_subject_id`) REFERENCES `auth_subjects` (`id`) ON UPDATE NO ACTION ON DELETE CASCADE
);
-- Create index "auth_credentials_credential_id" to table: "auth_credentials"
CREATE UNIQUE INDEX `auth_credentials_credential_id` ON `auth_credentials` (`credential_id`);
-- Create index "auth_credentials_auth_subject_id_idx" to table: "auth_credentials"
CREATE INDEX `auth_credentials_auth_subject_id_idx` ON `auth_credentials` (`auth_subject_id`);
-- Create "auth_sessions" table
CREATE TABLE `auth_sessions` (
  `session_id` text NOT NULL,
  `auth_subject_id` text NOT NULL,
  `digest` text NOT NULL,
  `security_revision` text NOT NULL,
  `issued_at` integer NOT NULL,
  `expires_at` integer NOT NULL,
  `absolute_expires_at` integer NOT NULL,
  `record` text NOT NULL,
  CONSTRAINT `0` FOREIGN KEY (`auth_subject_id`) REFERENCES `auth_subjects` (`id`) ON UPDATE NO ACTION ON DELETE CASCADE
);
-- Create index "auth_sessions_session_id" to table: "auth_sessions"
CREATE UNIQUE INDEX `auth_sessions_session_id` ON `auth_sessions` (`session_id`);
-- Create index "auth_sessions_digest" to table: "auth_sessions"
CREATE UNIQUE INDEX `auth_sessions_digest` ON `auth_sessions` (`digest`);
-- Create index "auth_sessions_auth_subject_id_idx" to table: "auth_sessions"
CREATE INDEX `auth_sessions_auth_subject_id_idx` ON `auth_sessions` (`auth_subject_id`);
-- Create "auth_pending" table
CREATE TABLE `auth_pending` (
  `module_id` text NOT NULL,
  `kind` text NOT NULL,
  `digest` text NOT NULL,
  `version` text NOT NULL,
  `flow_id` text NOT NULL,
  `auth_subject_id` text NOT NULL,
  `binding_digest` text NOT NULL,
  `snapshot` text NOT NULL,
  `expires_at` integer NOT NULL,
  `attempt_limit` integer NOT NULL,
  `failed_attempts` integer NOT NULL,
  `consumed` integer NOT NULL,
  CONSTRAINT `0` FOREIGN KEY (`auth_subject_id`) REFERENCES `auth_subjects` (`id`) ON UPDATE NO ACTION ON DELETE CASCADE
);
-- Create index "auth_pending_digest" to table: "auth_pending"
CREATE UNIQUE INDEX `auth_pending_digest` ON `auth_pending` (`digest`);
-- Create "auth_email_credentials" table
CREATE TABLE `auth_email_credentials` (
  `module_id` text NOT NULL,
  `auth_subject_id` text NOT NULL,
  `credential_id` text NOT NULL,
  `identifier_namespace` text NOT NULL,
  `identifier_value` text NOT NULL,
  `credential_revision` text NOT NULL,
  `active` integer NOT NULL,
  CONSTRAINT `0` FOREIGN KEY (`auth_subject_id`) REFERENCES `auth_subjects` (`id`) ON UPDATE NO ACTION ON DELETE CASCADE
);
-- Create index "auth_email_credentials_module_id_credential_id" to table: "auth_email_credentials"
CREATE UNIQUE INDEX `auth_email_credentials_module_id_credential_id` ON `auth_email_credentials` (`module_id`, `credential_id`);
-- Create index "auth_email_credentials_module_id_identifier_namespace_identifier_value" to table: "auth_email_credentials"
CREATE UNIQUE INDEX `auth_email_credentials_module_id_identifier_namespace_identifier_value` ON `auth_email_credentials` (`module_id`, `identifier_namespace`, `identifier_value`);
-- Create "auth_proofs" table
CREATE TABLE `auth_proofs` (
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
-- Create index "auth_proofs_module_id_purpose_series_key" to table: "auth_proofs"
CREATE UNIQUE INDEX `auth_proofs_module_id_purpose_series_key` ON `auth_proofs` (`module_id`, `purpose`, `series_key`);
-- Create index "auth_proofs_module_id_proof_id" to table: "auth_proofs"
CREATE UNIQUE INDEX `auth_proofs_module_id_proof_id` ON `auth_proofs` (`module_id`, `proof_id`);
-- Create "profiles" table
CREATE TABLE `profiles` (
  `id` text NOT NULL,
  `type` text NOT NULL,
  `handle` text NOT NULL,
  `name` text NOT NULL,
  `bio` json NULL,
  `location` text NULL,
  `photo_id` text NULL,
  `visibility` text NOT NULL,
  `searchable_text` text NOT NULL,
  `created_at` text NOT NULL,
  `updated_at` text NOT NULL,
  PRIMARY KEY (`id`),
  CONSTRAINT `0` FOREIGN KEY (`photo_id`) REFERENCES `media_assets` (`id`) ON UPDATE NO ACTION ON DELETE SET NULL
);
-- Create index "profiles_handle" to table: "profiles"
CREATE UNIQUE INDEX `profiles_handle` ON `profiles` (`handle`);
-- Create index "idx_profiles_handle" to table: "profiles"
CREATE INDEX `idx_profiles_handle` ON `profiles` (`handle`);
-- Create "people" table
CREATE TABLE `people` (
  `id` text NULL,
  `access_level` text NOT NULL,
  `access_set_by_id` text NULL,
  `access_set_at` text NULL,
  PRIMARY KEY (`id`),
  CONSTRAINT `0` FOREIGN KEY (`access_set_by_id`) REFERENCES `profiles` (`id`) ON UPDATE NO ACTION ON DELETE SET NULL,
  CONSTRAINT `1` FOREIGN KEY (`id`) REFERENCES `auth_subjects` (`id`) ON UPDATE NO ACTION ON DELETE CASCADE,
  CONSTRAINT `2` FOREIGN KEY (`id`) REFERENCES `profiles` (`id`) ON UPDATE NO ACTION ON DELETE CASCADE
);
-- Create "organizations" table
CREATE TABLE `organizations` (
  `id` text NULL,
  `type` text NOT NULL,
  `members_visibility` text NOT NULL,
  PRIMARY KEY (`id`),
  CONSTRAINT `0` FOREIGN KEY (`id`) REFERENCES `profiles` (`id`) ON UPDATE NO ACTION ON DELETE CASCADE
);
-- Create "organization_memberships" table
CREATE TABLE `organization_memberships` (
  `person_id` text NOT NULL,
  `organization_id` text NOT NULL,
  `access_level` text NOT NULL,
  `created_at` text NOT NULL,
  `updated_at` text NOT NULL,
  PRIMARY KEY (`person_id`, `organization_id`),
  CONSTRAINT `0` FOREIGN KEY (`organization_id`) REFERENCES `organizations` (`id`) ON UPDATE NO ACTION ON DELETE CASCADE,
  CONSTRAINT `1` FOREIGN KEY (`person_id`) REFERENCES `people` (`id`) ON UPDATE NO ACTION ON DELETE CASCADE
);
-- Create "organization_invitations" table
CREATE TABLE `organization_invitations` (
  `id` text NOT NULL,
  `organization_id` text NOT NULL,
  `email` text NOT NULL,
  `access_level` text NOT NULL,
  `status` text NOT NULL,
  `created_by_id` text NOT NULL,
  `created_at` text NOT NULL,
  `updated_at` text NOT NULL,
  PRIMARY KEY (`id`),
  CONSTRAINT `0` FOREIGN KEY (`created_by_id`) REFERENCES `people` (`id`) ON UPDATE NO ACTION ON DELETE CASCADE,
  CONSTRAINT `1` FOREIGN KEY (`organization_id`) REFERENCES `organizations` (`id`) ON UPDATE NO ACTION ON DELETE CASCADE
);
-- Create index "organization_invitations_organization_id_email" to table: "organization_invitations"
CREATE UNIQUE INDEX `organization_invitations_organization_id_email` ON `organization_invitations` (`organization_id`, `email`);
-- Create "media_assets" table
CREATE TABLE `media_assets` (
  `id` text NULL,
  `format` text NOT NULL,
  `content_type` text NULL,
  `byte_size` integer NULL,
  `category` text NULL,
  `descriptions` json NULL,
  `metadata` json NOT NULL,
  `moderation_status` text NOT NULL,
  `created_at` text NOT NULL,
  `updated_at` text NOT NULL,
  `owner_profile_id` text NOT NULL,
  PRIMARY KEY (`id`),
  CONSTRAINT `0` FOREIGN KEY (`owner_profile_id`) REFERENCES `profiles` (`id`) ON UPDATE NO ACTION ON DELETE CASCADE
);
-- Create "media_asset_credits" table
CREATE TABLE `media_asset_credits` (
  `media_asset_id` text NOT NULL,
  `order_index` integer NOT NULL,
  `credit_line` text NULL,
  `credit_url` text NULL,
  `person_id` text NULL,
  PRIMARY KEY (`media_asset_id`, `order_index`),
  CONSTRAINT `0` FOREIGN KEY (`person_id`) REFERENCES `people` (`id`) ON UPDATE NO ACTION ON DELETE CASCADE,
  CONSTRAINT `1` FOREIGN KEY (`media_asset_id`) REFERENCES `media_assets` (`id`) ON UPDATE NO ACTION ON DELETE CASCADE
);
-- Create "wiki_article_sources" table
CREATE TABLE `wiki_article_sources` (
  `id` text NOT NULL,
  `status` text NOT NULL,
  `crdt_snapshot` blob NOT NULL,
  `created_at` text NOT NULL,
  `updated_at` text NOT NULL,
  PRIMARY KEY (`id`)
);
-- Create "wiki_article_revisions" table
CREATE TABLE `wiki_article_revisions` (
  `id` text NULL,
  `wiki_article_id` text NOT NULL,
  `created_by_id` text NULL,
  `crdt_update` blob NOT NULL,
  `from_crdt_frontier` json NOT NULL,
  `evaluation` text NOT NULL,
  `evaluation_reason` text NULL,
  `has_media_selection` integer NOT NULL DEFAULT 0,
  `evaluated_by_id` text NULL,
  `evaluated_at` text NULL,
  `created_at` text NOT NULL,
  `updated_at` text NOT NULL,
  PRIMARY KEY (`id`),
  CONSTRAINT `0` FOREIGN KEY (`evaluated_by_id`) REFERENCES `people` (`id`) ON UPDATE NO ACTION ON DELETE SET NULL,
  CONSTRAINT `1` FOREIGN KEY (`created_by_id`) REFERENCES `people` (`id`) ON UPDATE NO ACTION ON DELETE SET NULL,
  CONSTRAINT `2` FOREIGN KEY (`wiki_article_id`) REFERENCES `wiki_article_sources` (`id`) ON UPDATE NO ACTION ON DELETE CASCADE,
  CHECK (has_media_selection IN (0, 1))
);
-- Create index "idx_wiki_article_revisions_article_evaluation" to table: "wiki_article_revisions"
CREATE INDEX `idx_wiki_article_revisions_article_evaluation` ON `wiki_article_revisions` (`wiki_article_id`, `evaluation`);
-- Create "wiki_article_revision_media_assets" table
CREATE TABLE `wiki_article_revision_media_assets` (
  `wiki_article_revision_id` text NOT NULL,
  `media_asset_id` text NOT NULL,
  `category` text NULL,
  `has_category_override` integer NOT NULL DEFAULT 0,
  `descriptions` json NULL,
  PRIMARY KEY (`wiki_article_revision_id`, `media_asset_id`),
  CONSTRAINT `0` FOREIGN KEY (`media_asset_id`) REFERENCES `media_assets` (`id`) ON UPDATE NO ACTION ON DELETE CASCADE,
  CONSTRAINT `1` FOREIGN KEY (`wiki_article_revision_id`) REFERENCES `wiki_article_revisions` (`id`) ON UPDATE NO ACTION ON DELETE CASCADE,
  CHECK (has_category_override IN (0, 1))
);
-- Create index "idx_wiki_article_revision_media_assets_media_asset" to table: "wiki_article_revision_media_assets"
CREATE INDEX `idx_wiki_article_revision_media_assets_media_asset` ON `wiki_article_revision_media_assets` (`media_asset_id`);
-- Create "wiki_article_projections" table
CREATE TABLE `wiki_article_projections` (
  `id` text NULL,
  `kind` text NOT NULL,
  `status` text NOT NULL,
  `attributes` json NOT NULL,
  `current_crdt_frontier` json NOT NULL,
  `created_at` text NOT NULL,
  `updated_at` text NOT NULL,
  PRIMARY KEY (`id`),
  CONSTRAINT `0` FOREIGN KEY (`id`) REFERENCES `wiki_article_sources` (`id`) ON UPDATE NO ACTION ON DELETE CASCADE
);
-- Create index "idx_wiki_article_projections_id_kind" to table: "wiki_article_projections"
CREATE UNIQUE INDEX `idx_wiki_article_projections_id_kind` ON `wiki_article_projections` (`id`, `kind`);
-- Create index "idx_wiki_article_projections_kind_status" to table: "wiki_article_projections"
CREATE INDEX `idx_wiki_article_projections_kind_status` ON `wiki_article_projections` (`kind`, `status`);
-- Create "wiki_article_translations" table
CREATE TABLE `wiki_article_translations` (
  `wiki_article_id` text NOT NULL,
  `kind` text NOT NULL,
  `language` text NOT NULL,
  `common_names` json NOT NULL,
  `searchable_title` text NOT NULL,
  `searchable_names` text NOT NULL,
  `content` json NULL,
  `content_plain_text` text NOT NULL,
  `searchable_content` text NOT NULL,
  `origin` text NULL,
  PRIMARY KEY (`wiki_article_id`, `language`),
  CONSTRAINT `0` FOREIGN KEY (`wiki_article_id`, `kind`) REFERENCES `wiki_article_projections` (`id`, `kind`) ON UPDATE NO ACTION ON DELETE CASCADE,
  CHECK (
    kind = 'PLANT'
    OR origin IS NULL
  )
);
-- Create "wiki_article_handles" table
CREATE TABLE `wiki_article_handles` (
  `wiki_article_id` text NOT NULL,
  `kind` text NOT NULL,
  `handle` text NOT NULL,
  `language` text NOT NULL,
  PRIMARY KEY (`wiki_article_id`, `kind`, `handle`),
  CONSTRAINT `0` FOREIGN KEY (`wiki_article_id`) REFERENCES `wiki_article_sources` (`id`) ON UPDATE NO ACTION ON DELETE CASCADE
);
-- Create index "wiki_article_handles_kind_handle" to table: "wiki_article_handles"
CREATE UNIQUE INDEX `wiki_article_handles_kind_handle` ON `wiki_article_handles` (`kind`, `handle`);
-- Create "wiki_article_relations" table
CREATE TABLE `wiki_article_relations` (
  `wiki_article_id` text NOT NULL,
  `related_wiki_article_id` text NOT NULL,
  `source` text NOT NULL,
  `evidence` json NULL,
  PRIMARY KEY (`wiki_article_id`, `related_wiki_article_id`, `source`),
  CONSTRAINT `0` FOREIGN KEY (`wiki_article_id`) REFERENCES `wiki_article_sources` (`id`) ON UPDATE NO ACTION ON DELETE CASCADE,
  CHECK (wiki_article_id <> related_wiki_article_id),
  CHECK ((source = 'LEGACY_TAG') = (evidence IS NULL))
);
-- Create index "idx_wiki_article_relations_related" to table: "wiki_article_relations"
CREATE INDEX `idx_wiki_article_relations_related` ON `wiki_article_relations` (`related_wiki_article_id`);
-- Create "wiki_article_media_assets" table
CREATE TABLE `wiki_article_media_assets` (
  `wiki_article_id` text NOT NULL,
  `media_asset_id` text NOT NULL,
  PRIMARY KEY (`wiki_article_id`, `media_asset_id`),
  CONSTRAINT `0` FOREIGN KEY (`media_asset_id`) REFERENCES `media_assets` (`id`) ON UPDATE NO ACTION ON DELETE CASCADE,
  CONSTRAINT `1` FOREIGN KEY (`wiki_article_id`) REFERENCES `wiki_article_sources` (`id`) ON UPDATE NO ACTION ON DELETE CASCADE
);
-- Create "wiki_article_main_media" table
CREATE TABLE `wiki_article_main_media` (
  `wiki_article_id` text NOT NULL,
  `media_asset_id` text NOT NULL,
  PRIMARY KEY (`wiki_article_id`),
  CONSTRAINT `0` FOREIGN KEY (`wiki_article_id`, `media_asset_id`) REFERENCES `wiki_article_media_assets` (`wiki_article_id`, `media_asset_id`) ON UPDATE NO ACTION ON DELETE CASCADE
);
-- Create "publication_sources" table
CREATE TABLE `publication_sources` (
  `id` text NOT NULL,
  `crdt_snapshot` blob NOT NULL,
  `link_inference` json NULL,
  `moderation_status` text NOT NULL,
  `owner_profile_id` text NOT NULL,
  `handle` text NOT NULL,
  `visibility` text NOT NULL,
  `published_at` text NOT NULL,
  `created_at` text NOT NULL,
  `updated_at` text NOT NULL,
  PRIMARY KEY (`id`),
  CONSTRAINT `0` FOREIGN KEY (`owner_profile_id`) REFERENCES `profiles` (`id`) ON UPDATE NO ACTION ON DELETE CASCADE
);
-- Create index "publication_sources_handle" to table: "publication_sources"
CREATE UNIQUE INDEX `publication_sources_handle` ON `publication_sources` (`handle`);
-- Create index "idx_publication_sources_owner_profile_id" to table: "publication_sources"
CREATE INDEX `idx_publication_sources_owner_profile_id` ON `publication_sources` (`owner_profile_id`);
-- Create index "idx_publication_sources_published_at" to table: "publication_sources"
CREATE INDEX `idx_publication_sources_published_at` ON `publication_sources` (`published_at`);
-- Create "publication_revisions" table
CREATE TABLE `publication_revisions` (
  `id` text NULL,
  `publication_id` text NOT NULL,
  `created_by_id` text NULL,
  `from_crdt_frontier` json NOT NULL,
  `crdt_update` blob NOT NULL,
  `updated_at` text NOT NULL,
  `created_at` text NOT NULL,
  PRIMARY KEY (`id`),
  CONSTRAINT `0` FOREIGN KEY (`created_by_id`) REFERENCES `people` (`id`) ON UPDATE NO ACTION ON DELETE SET NULL,
  CONSTRAINT `1` FOREIGN KEY (`publication_id`) REFERENCES `publication_sources` (`id`) ON UPDATE NO ACTION ON DELETE CASCADE
);
-- Create "publication_projections" table
CREATE TABLE `publication_projections` (
  `id` text NULL,
  `current_crdt_frontier` json NOT NULL,
  `created_at` text NOT NULL,
  `updated_at` text NOT NULL,
  `kind` text NOT NULL,
  `start_date` text NULL,
  `end_date` text NULL,
  `location_or_url` text NULL,
  `attendance_mode` text NULL,
  PRIMARY KEY (`id`),
  CONSTRAINT `0` FOREIGN KEY (`id`) REFERENCES `publication_sources` (`id`) ON UPDATE NO ACTION ON DELETE CASCADE
);
-- Create index "idx_publication_projections_kind" to table: "publication_projections"
CREATE INDEX `idx_publication_projections_kind` ON `publication_projections` (`kind`);
-- Create "publication_translations" table
CREATE TABLE `publication_translations` (
  `publication_id` text NOT NULL,
  `language` text NOT NULL,
  `content` json NOT NULL,
  `content_plain_text` text NOT NULL,
  `searchable_content` text NOT NULL,
  `translated_at_crdt_frontier` json NOT NULL,
  `translation_source` text NOT NULL,
  `original_language` text NOT NULL,
  PRIMARY KEY (`publication_id`, `language`),
  CONSTRAINT `0` FOREIGN KEY (`publication_id`) REFERENCES `publication_sources` (`id`) ON UPDATE NO ACTION ON DELETE CASCADE
);
-- Create "publication_media_assets" table
CREATE TABLE `publication_media_assets` (
  `publication_id` text NOT NULL,
  `media_asset_id` text NOT NULL,
  PRIMARY KEY (`publication_id`, `media_asset_id`),
  CONSTRAINT `0` FOREIGN KEY (`media_asset_id`) REFERENCES `media_assets` (`id`) ON UPDATE NO ACTION ON DELETE CASCADE,
  CONSTRAINT `1` FOREIGN KEY (`publication_id`) REFERENCES `publication_sources` (`id`) ON UPDATE NO ACTION ON DELETE CASCADE
);
-- Create "publication_wiki_articles" table
CREATE TABLE `publication_wiki_articles` (
  `publication_id` text NOT NULL,
  `wiki_article_id` text NOT NULL,
  `source` text NOT NULL,
  `evidence` json NULL,
  PRIMARY KEY (`publication_id`, `wiki_article_id`, `source`),
  CONSTRAINT `0` FOREIGN KEY (`wiki_article_id`) REFERENCES `wiki_article_sources` (`id`) ON UPDATE NO ACTION ON DELETE CASCADE,
  CONSTRAINT `1` FOREIGN KEY (`publication_id`) REFERENCES `publication_sources` (`id`) ON UPDATE NO ACTION ON DELETE CASCADE,
  CHECK ((source = 'LEGACY_TAG') = (evidence IS NULL))
);
-- Create "publication_comments" table
CREATE TABLE `publication_comments` (
  `id` text NULL,
  `publication_id` text NOT NULL,
  `parent_publication_comment_id` text NULL,
  `moderation_status` text NOT NULL,
  `created_at` text NOT NULL,
  `updated_at` text NOT NULL,
  `owner_profile_id` text NOT NULL,
  `source_language` text NOT NULL,
  `source_content` json NOT NULL,
  PRIMARY KEY (`id`),
  CONSTRAINT `0` FOREIGN KEY (`publication_id`) REFERENCES `publication_sources` (`id`) ON UPDATE NO ACTION ON DELETE CASCADE,
  CONSTRAINT `1` FOREIGN KEY (`owner_profile_id`) REFERENCES `profiles` (`id`) ON UPDATE NO ACTION ON DELETE CASCADE,
  CONSTRAINT `2` FOREIGN KEY (`parent_publication_comment_id`) REFERENCES `publication_comments` (`id`) ON UPDATE NO ACTION ON DELETE CASCADE
);
-- Create "publication_comment_content_revisions" table
CREATE TABLE `publication_comment_content_revisions` (
  `id` text NULL,
  `publication_comment_id` text NOT NULL,
  `created_by_id` text NULL,
  `created_at` text NOT NULL,
  PRIMARY KEY (`id`),
  CONSTRAINT `0` FOREIGN KEY (`created_by_id`) REFERENCES `people` (`id`) ON UPDATE NO ACTION ON DELETE SET NULL,
  CONSTRAINT `1` FOREIGN KEY (`publication_comment_id`) REFERENCES `publication_comments` (`id`) ON UPDATE NO ACTION ON DELETE CASCADE
);
-- Create index "publication_comment_content_revisions_publication_comment_id_id" to table: "publication_comment_content_revisions"
CREATE UNIQUE INDEX `publication_comment_content_revisions_publication_comment_id_id` ON `publication_comment_content_revisions` (`publication_comment_id`, `id`);
-- Create index "idx_publication_comment_content_revisions_comment" to table: "publication_comment_content_revisions"
CREATE INDEX `idx_publication_comment_content_revisions_comment` ON `publication_comment_content_revisions` (`publication_comment_id`, `created_at`, `id`);
-- Create "publication_comment_translations" table
CREATE TABLE `publication_comment_translations` (
  `publication_comment_id` text NOT NULL,
  `language` text NOT NULL,
  `content` json NOT NULL,
  `content_plain_text` text NOT NULL,
  `translated_at_revision_id` text NOT NULL,
  PRIMARY KEY (`publication_comment_id`, `language`),
  CONSTRAINT `0` FOREIGN KEY (`publication_comment_id`, `translated_at_revision_id`) REFERENCES `publication_comment_content_revisions` (`publication_comment_id`, `id`) ON UPDATE NO ACTION ON DELETE CASCADE,
  CONSTRAINT `1` FOREIGN KEY (`publication_comment_id`) REFERENCES `publication_comments` (`id`) ON UPDATE NO ACTION ON DELETE CASCADE
);
-- Create "bookmarks_wiki_articles" table
CREATE TABLE `bookmarks_wiki_articles` (
  `person_id` text NOT NULL,
  `wiki_article_id` text NOT NULL,
  `state` text NOT NULL,
  PRIMARY KEY (`person_id`, `wiki_article_id`),
  CONSTRAINT `0` FOREIGN KEY (`wiki_article_id`) REFERENCES `wiki_article_sources` (`id`) ON UPDATE NO ACTION ON DELETE CASCADE,
  CONSTRAINT `1` FOREIGN KEY (`person_id`) REFERENCES `people` (`id`) ON UPDATE NO ACTION ON DELETE CASCADE
);
-- Create "wiki_article_external_data_observations" table
CREATE TABLE `wiki_article_external_data_observations` (
  `id` text NOT NULL,
  `wiki_article_id` text NOT NULL,
  `provider` text NOT NULL,
  `observed_at` text NOT NULL,
  `article_crdt_frontier` json NOT NULL,
  `inputs` json NOT NULL,
  `outcome` json NOT NULL,
  PRIMARY KEY (`id`),
  CONSTRAINT `0` FOREIGN KEY (`wiki_article_id`) REFERENCES `wiki_article_sources` (`id`) ON UPDATE NO ACTION ON DELETE CASCADE
);
-- Create index "idx_external_data_observations_article_provider" to table: "wiki_article_external_data_observations"
CREATE INDEX `idx_external_data_observations_article_provider` ON `wiki_article_external_data_observations` (`wiki_article_id`, `provider`, `observed_at`, `id`);
-- Create "wiki_article_external_links" table
CREATE TABLE `wiki_article_external_links` (
  `wiki_article_id` text NOT NULL,
  `language` text NOT NULL,
  `url` text NOT NULL,
  PRIMARY KEY (`wiki_article_id`, `language`),
  CONSTRAINT `0` FOREIGN KEY (`wiki_article_id`) REFERENCES `wiki_article_sources` (`id`) ON UPDATE NO ACTION ON DELETE CASCADE
);
-- Create "wiki_plant_taxonomy_group" table
CREATE TABLE `wiki_plant_taxonomy_group` (
  `wiki_article_id` text NOT NULL,
  `gbif_taxon_id` text NOT NULL,
  `taxonomy_group` text NULL,
  PRIMARY KEY (`wiki_article_id`),
  CONSTRAINT `0` FOREIGN KEY (`wiki_article_id`) REFERENCES `wiki_article_sources` (`id`) ON UPDATE NO ACTION ON DELETE CASCADE
);
-- Create index "idx_plant_taxon" to table: "wiki_plant_taxonomy_group"
CREATE INDEX `idx_plant_taxon` ON `wiki_plant_taxonomy_group` (`gbif_taxon_id`);
-- Create "wiki_plant_taxonomy_classification" table
CREATE TABLE `wiki_plant_taxonomy_classification` (
  `wiki_article_id` text NOT NULL,
  `taxon_id` text NOT NULL,
  `scientific_name` text NOT NULL,
  `taxon_rank` text NOT NULL,
  PRIMARY KEY (`wiki_article_id`, `taxon_rank`),
  CONSTRAINT `0` FOREIGN KEY (`wiki_article_id`) REFERENCES `wiki_article_sources` (`id`) ON UPDATE NO ACTION ON DELETE CASCADE
);
-- Create index "idx_plant_classification" to table: "wiki_plant_taxonomy_classification"
CREATE INDEX `idx_plant_classification` ON `wiki_plant_taxonomy_classification` (`taxon_rank`, `scientific_name`);
-- Create "wiki_article_external_media" table
CREATE TABLE `wiki_article_external_media` (
  `wiki_article_id` text NOT NULL,
  `media_url` text NOT NULL,
  `source_url` text NOT NULL,
  `credit_line` text NOT NULL,
  `license_url` text NULL,
  PRIMARY KEY (`wiki_article_id`, `media_url`),
  CONSTRAINT `0` FOREIGN KEY (`wiki_article_id`) REFERENCES `wiki_article_sources` (`id`) ON UPDATE NO ACTION ON DELETE CASCADE
);
-- Create "wiki_book_editions" table
CREATE TABLE `wiki_book_editions` (
  `wiki_article_id` text NOT NULL,
  `provider` text NOT NULL,
  `external_id` text NOT NULL,
  `title` text NOT NULL,
  `publisher` text NULL,
  `publication_date` text NULL,
  `page_count` integer NULL,
  `isbn` json NOT NULL,
  `source_url` text NOT NULL,
  PRIMARY KEY (`wiki_article_id`, `provider`, `external_id`),
  CONSTRAINT `0` FOREIGN KEY (`wiki_article_id`) REFERENCES `wiki_article_sources` (`id`) ON UPDATE NO ACTION ON DELETE CASCADE
);
-- Create "wiki_book_edition_languages" table
CREATE TABLE `wiki_book_edition_languages` (
  `wiki_article_id` text NOT NULL,
  `provider` text NOT NULL,
  `external_id` text NOT NULL,
  `language` text NOT NULL,
  PRIMARY KEY (`wiki_article_id`, `provider`, `external_id`, `language`),
  CONSTRAINT `0` FOREIGN KEY (`wiki_article_id`, `provider`, `external_id`) REFERENCES `wiki_book_editions` (`wiki_article_id`, `provider`, `external_id`) ON UPDATE NO ACTION ON DELETE CASCADE
);
-- Create index "idx_book_edition_language" to table: "wiki_book_edition_languages"
CREATE INDEX `idx_book_edition_language` ON `wiki_book_edition_languages` (`language`, `wiki_article_id`);
