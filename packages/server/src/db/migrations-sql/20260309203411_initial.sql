-- Create "accounts" table
CREATE TABLE `accounts` (
  `id` text NOT NULL,
  `name` text NOT NULL,
  `email` text NOT NULL,
  `is_email_verified` integer NOT NULL,
  `image` text NULL,
  `created_at` text NOT NULL,
  `updated_at` text NOT NULL,
  PRIMARY KEY (`id`)
);
-- Create index "accounts_email" to table: "accounts"
CREATE UNIQUE INDEX `accounts_email` ON `accounts` (`email`);
-- Create "sessions" table
CREATE TABLE `sessions` (
  `id` text NOT NULL,
  `expires_at` date NOT NULL,
  `token` text NOT NULL,
  `created_at` text NOT NULL,
  `updated_at` text NOT NULL,
  `ip_address` text NULL,
  `user_agent` text NULL,
  `account_id` text NOT NULL,
  PRIMARY KEY (`id`),
  CONSTRAINT `0` FOREIGN KEY (`account_id`) REFERENCES `accounts` (`id`) ON UPDATE NO ACTION ON DELETE CASCADE
);
-- Create index "sessions_token" to table: "sessions"
CREATE UNIQUE INDEX `sessions_token` ON `sessions` (`token`);
-- Create index "session_account_id_idx" to table: "sessions"
CREATE INDEX `session_account_id_idx` ON `sessions` (`account_id`);
-- Create "oauth_accounts" table
CREATE TABLE `oauth_accounts` (
  `id` text NOT NULL,
  `oauth_account_id` text NOT NULL,
  `provider_id` text NOT NULL,
  `account_id` text NOT NULL,
  `access_token` text NULL,
  `refresh_token` text NULL,
  `id_token` text NULL,
  `access_token_expires_at` text NULL,
  `refresh_token_expires_at` text NULL,
  `scope` text NULL,
  `password` text NULL,
  `created_at` text NOT NULL,
  `updated_at` text NOT NULL,
  PRIMARY KEY (`id`),
  CONSTRAINT `0` FOREIGN KEY (`account_id`) REFERENCES `accounts` (`id`) ON UPDATE NO ACTION ON DELETE CASCADE
);
-- Create index "account_account_id_idx" to table: "oauth_accounts"
CREATE INDEX `account_account_id_idx` ON `oauth_accounts` (`account_id`);
-- Create "verifications" table
CREATE TABLE `verifications` (
  `id` text NOT NULL,
  `identifier` text NOT NULL,
  `value` text NOT NULL,
  `expires_at` text NOT NULL,
  `created_at` text NOT NULL,
  `updated_at` text NOT NULL,
  PRIMARY KEY (`id`)
);
-- Create index "verification_identifier_idx" to table: "verifications"
CREATE INDEX `verification_identifier_idx` ON `verifications` (`identifier`);
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
  `created_at` text NOT NULL,
  `updated_at` text NOT NULL,
  PRIMARY KEY (`id`),
  CONSTRAINT `0` FOREIGN KEY (`photo_id`) REFERENCES `images` (`id`) ON UPDATE NO ACTION ON DELETE SET NULL
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
  CONSTRAINT `1` FOREIGN KEY (`id`) REFERENCES `accounts` (`id`) ON UPDATE NO ACTION ON DELETE CASCADE,
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
) WITHOUT ROWID;
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
-- Create "tags" table
CREATE TABLE `tags` (
  `id` text NULL,
  `handle` text NOT NULL,
  `names` json NOT NULL,
  `description` json NULL,
  `cluster` text NULL,
  `created_at` text NOT NULL,
  `updated_at` text NOT NULL,
  `created_by_id` text NULL,
  PRIMARY KEY (`id`)
);
-- Create index "tags_handle" to table: "tags"
CREATE UNIQUE INDEX `tags_handle` ON `tags` (`handle`);
-- Create index "idx_tags_handle" to table: "tags"
CREATE INDEX `idx_tags_handle` ON `tags` (`handle`);
-- Create "suggested_tags" table
CREATE TABLE `suggested_tags` (
  `id` text NULL,
  `handle` text NOT NULL,
  `names` json NOT NULL,
  `status` text NOT NULL,
  `approved_tag_id` text NULL,
  `created_at` text NOT NULL,
  `updated_at` text NOT NULL,
  PRIMARY KEY (`id`),
  CONSTRAINT `0` FOREIGN KEY (`approved_tag_id`) REFERENCES `tags` (`id`) ON UPDATE NO ACTION ON DELETE SET NULL
);
-- Create index "suggested_tags_handle" to table: "suggested_tags"
CREATE UNIQUE INDEX `suggested_tags_handle` ON `suggested_tags` (`handle`);
-- Create "suggested_tag_sources" table
CREATE TABLE `suggested_tag_sources` (
  `suggested_tag_id` text NOT NULL,
  `post_id` text NOT NULL,
  PRIMARY KEY (`suggested_tag_id`, `post_id`),
  CONSTRAINT `0` FOREIGN KEY (`post_id`) REFERENCES `post_crdts` (`id`) ON UPDATE NO ACTION ON DELETE CASCADE,
  CONSTRAINT `1` FOREIGN KEY (`suggested_tag_id`) REFERENCES `suggested_tags` (`id`) ON UPDATE NO ACTION ON DELETE CASCADE
) WITHOUT ROWID;
-- Create "images" table
CREATE TABLE `images` (
  `id` text NULL,
  `sanity_id` text NOT NULL,
  `label` text NULL,
  `hotspot` json NULL,
  `crop` json NULL,
  `metadata` json NULL,
  `created_at` text NOT NULL,
  `updated_at` text NOT NULL,
  `owner_profile_id` text NOT NULL,
  PRIMARY KEY (`id`),
  CONSTRAINT `0` FOREIGN KEY (`owner_profile_id`) REFERENCES `profiles` (`id`) ON UPDATE NO ACTION ON DELETE CASCADE
);
-- Create index "images_sanity_id" to table: "images"
CREATE UNIQUE INDEX `images_sanity_id` ON `images` (`sanity_id`);
-- Create "image_credits" table
CREATE TABLE `image_credits` (
  `image_id` text NOT NULL,
  `order_index` integer NOT NULL,
  `credit_line` text NULL,
  `credit_url` text NULL,
  `person_id` text NULL,
  PRIMARY KEY (`image_id`, `order_index`),
  CONSTRAINT `0` FOREIGN KEY (`person_id`) REFERENCES `people` (`id`) ON UPDATE NO ACTION ON DELETE CASCADE,
  CONSTRAINT `1` FOREIGN KEY (`image_id`) REFERENCES `images` (`id`) ON UPDATE NO ACTION ON DELETE CASCADE
) WITHOUT ROWID;
-- Create "vegetable_crdts" table
CREATE TABLE `vegetable_crdts` (
  `id` text NOT NULL,
  `crdt_snapshot` blob NOT NULL,
  `created_at` text NOT NULL,
  `updated_at` text NULL,
  PRIMARY KEY (`id`)
) WITHOUT ROWID;
-- Create "vegetable_revisions" table
CREATE TABLE `vegetable_revisions` (
  `id` text NULL,
  `vegetable_id` text NULL,
  `created_by_id` text NULL,
  `crdt_update` blob NOT NULL,
  `from_crdt_frontier` json NOT NULL,
  `evaluation` text NOT NULL,
  `evaluated_by_id` text NULL,
  `evaluated_at` text NULL,
  `created_at` text NOT NULL,
  `updated_at` text NOT NULL,
  PRIMARY KEY (`id`),
  CONSTRAINT `0` FOREIGN KEY (`evaluated_by_id`) REFERENCES `people` (`id`) ON UPDATE NO ACTION ON DELETE SET NULL,
  CONSTRAINT `1` FOREIGN KEY (`created_by_id`) REFERENCES `people` (`id`) ON UPDATE NO ACTION ON DELETE SET NULL,
  CONSTRAINT `2` FOREIGN KEY (`vegetable_id`) REFERENCES `vegetable_crdts` (`id`) ON UPDATE NO ACTION ON DELETE CASCADE
);
-- Create "vegetables" table
CREATE TABLE `vegetables` (
  `id` text NULL,
  `current_crdt_frontier` json NOT NULL,
  `handle` text NOT NULL,
  `scientific_names` json NULL,
  `development_cycle_min` integer NULL,
  `development_cycle_max` integer NULL,
  `height_min` real NULL,
  `height_max` real NULL,
  `temperature_min` real NULL,
  `temperature_max` real NULL,
  `chinese_medicine_element` text NULL,
  `main_photo_id` text NULL,
  PRIMARY KEY (`id`),
  CONSTRAINT `0` FOREIGN KEY (`main_photo_id`) REFERENCES `images` (`id`) ON UPDATE NO ACTION ON DELETE SET NULL,
  CONSTRAINT `1` FOREIGN KEY (`id`) REFERENCES `vegetable_crdts` (`id`) ON UPDATE NO ACTION ON DELETE CASCADE
);
-- Create index "vegetables_handle" to table: "vegetables"
CREATE UNIQUE INDEX `vegetables_handle` ON `vegetables` (`handle`);
-- Create index "idx_vegetables_handle" to table: "vegetables"
CREATE INDEX `idx_vegetables_handle` ON `vegetables` (`handle`);
-- Create "vegetable_translations" table
CREATE TABLE `vegetable_translations` (
  `vegetable_id` text NOT NULL,
  `locale` text NOT NULL,
  `common_names` json NOT NULL,
  `searchable_names` text NULL,
  `grammatical_gender` text NULL,
  `origin` text NULL,
  `content` json NULL,
  PRIMARY KEY (`vegetable_id`, `locale`),
  CONSTRAINT `0` FOREIGN KEY (`vegetable_id`) REFERENCES `vegetable_crdts` (`id`) ON UPDATE NO ACTION ON DELETE CASCADE
) WITHOUT ROWID;
-- Create index "idx_vegetables_searchable_names" to table: "vegetable_translations"
CREATE INDEX `idx_vegetables_searchable_names` ON `vegetable_translations` (`searchable_names`);
-- Create "vegetable_strata" table
CREATE TABLE `vegetable_strata` (
  `vegetable_id` text NOT NULL,
  `stratum` text NOT NULL,
  PRIMARY KEY (`vegetable_id`, `stratum`),
  CONSTRAINT `0` FOREIGN KEY (`vegetable_id`) REFERENCES `vegetable_crdts` (`id`) ON UPDATE NO ACTION ON DELETE CASCADE
) WITHOUT ROWID;
-- Create "vegetable_planting_methods" table
CREATE TABLE `vegetable_planting_methods` (
  `vegetable_id` text NOT NULL,
  `planting_method` text NOT NULL,
  PRIMARY KEY (`vegetable_id`, `planting_method`),
  CONSTRAINT `0` FOREIGN KEY (`vegetable_id`) REFERENCES `vegetable_crdts` (`id`) ON UPDATE NO ACTION ON DELETE CASCADE
) WITHOUT ROWID;
-- Create "vegetable_edible_parts" table
CREATE TABLE `vegetable_edible_parts` (
  `vegetable_id` text NOT NULL,
  `edible_part` text NOT NULL,
  PRIMARY KEY (`vegetable_id`, `edible_part`),
  CONSTRAINT `0` FOREIGN KEY (`vegetable_id`) REFERENCES `vegetable_crdts` (`id`) ON UPDATE NO ACTION ON DELETE CASCADE
) WITHOUT ROWID;
-- Create "vegetable_lifecycles" table
CREATE TABLE `vegetable_lifecycles` (
  `vegetable_id` text NOT NULL,
  `lifecycle` text NOT NULL,
  PRIMARY KEY (`vegetable_id`, `lifecycle`),
  CONSTRAINT `0` FOREIGN KEY (`vegetable_id`) REFERENCES `vegetable_crdts` (`id`) ON UPDATE NO ACTION ON DELETE CASCADE
) WITHOUT ROWID;
-- Create "vegetable_uses" table
CREATE TABLE `vegetable_uses` (
  `vegetable_id` text NOT NULL,
  `usage` text NOT NULL,
  PRIMARY KEY (`vegetable_id`, `usage`),
  CONSTRAINT `0` FOREIGN KEY (`vegetable_id`) REFERENCES `vegetable_crdts` (`id`) ON UPDATE NO ACTION ON DELETE CASCADE
) WITHOUT ROWID;
-- Create "vegetable_varieties" table
CREATE TABLE `vegetable_varieties` (
  `id` text NULL,
  `vegetable_id` text NOT NULL,
  `handle` text NOT NULL,
  `scientific_names` json NULL,
  `created_at` text NOT NULL,
  `updated_at` text NOT NULL,
  `created_by_id` text NULL,
  PRIMARY KEY (`id`),
  CONSTRAINT `0` FOREIGN KEY (`vegetable_id`) REFERENCES `vegetable_crdts` (`id`) ON UPDATE NO ACTION ON DELETE CASCADE
);
-- Create index "vegetable_varieties_handle" to table: "vegetable_varieties"
CREATE UNIQUE INDEX `vegetable_varieties_handle` ON `vegetable_varieties` (`handle`);
-- Create index "idx_vegetable_varieties_handle" to table: "vegetable_varieties"
CREATE INDEX `idx_vegetable_varieties_handle` ON `vegetable_varieties` (`handle`);
-- Create "vegetable_variety_translations" table
CREATE TABLE `vegetable_variety_translations` (
  `variety_id` text NOT NULL,
  `locale` text NOT NULL,
  `common_names` json NOT NULL,
  `content` json NULL,
  PRIMARY KEY (`variety_id`, `locale`),
  CONSTRAINT `0` FOREIGN KEY (`variety_id`) REFERENCES `vegetable_varieties` (`id`) ON UPDATE NO ACTION ON DELETE CASCADE
) WITHOUT ROWID;
-- Create "vegetable_variety_photos" table
CREATE TABLE `vegetable_variety_photos` (
  `variety_id` text NOT NULL,
  `image_id` text NOT NULL,
  `order_index` integer NULL,
  PRIMARY KEY (`variety_id`, `image_id`),
  CONSTRAINT `0` FOREIGN KEY (`image_id`) REFERENCES `images` (`id`) ON UPDATE NO ACTION ON DELETE CASCADE,
  CONSTRAINT `1` FOREIGN KEY (`variety_id`) REFERENCES `vegetable_varieties` (`id`) ON UPDATE NO ACTION ON DELETE CASCADE
) WITHOUT ROWID;
-- Create "vegetable_photos" table
CREATE TABLE `vegetable_photos` (
  `vegetable_id` text NOT NULL,
  `image_id` text NOT NULL,
  `order_index` integer NULL,
  PRIMARY KEY (`vegetable_id`, `image_id`),
  CONSTRAINT `0` FOREIGN KEY (`image_id`) REFERENCES `images` (`id`) ON UPDATE NO ACTION ON DELETE CASCADE,
  CONSTRAINT `1` FOREIGN KEY (`vegetable_id`) REFERENCES `vegetable_crdts` (`id`) ON UPDATE NO ACTION ON DELETE CASCADE
) WITHOUT ROWID;
-- Create "vegetable_photo_metadata" table
CREATE TABLE `vegetable_photo_metadata` (
  `id` text NULL,
  `category` text NOT NULL,
  `description` json NULL,
  `moderation_status` text NULL,
  `created_at` text NOT NULL,
  `updated_at` text NOT NULL,
  PRIMARY KEY (`id`),
  CONSTRAINT `0` FOREIGN KEY (`id`) REFERENCES `images` (`id`) ON UPDATE NO ACTION ON DELETE CASCADE
);
-- Create "resource_crdts" table
CREATE TABLE `resource_crdts` (
  `id` text NOT NULL,
  `crdt_snapshot` blob NOT NULL,
  `created_at` text NOT NULL,
  `updated_at` text NULL,
  PRIMARY KEY (`id`)
) WITHOUT ROWID;
-- Create "resource_revisions" table
CREATE TABLE `resource_revisions` (
  `id` text NULL,
  `resource_id` text NULL,
  `created_by_id` text NULL,
  `crdt_update` blob NOT NULL,
  `from_crdt_frontier` json NOT NULL,
  `evaluation` text NOT NULL,
  `evaluated_by_id` text NULL,
  `evaluated_at` text NULL,
  `created_at` text NOT NULL,
  `updated_at` text NOT NULL,
  PRIMARY KEY (`id`),
  CONSTRAINT `0` FOREIGN KEY (`evaluated_by_id`) REFERENCES `people` (`id`) ON UPDATE NO ACTION ON DELETE SET NULL,
  CONSTRAINT `1` FOREIGN KEY (`created_by_id`) REFERENCES `people` (`id`) ON UPDATE NO ACTION ON DELETE SET NULL,
  CONSTRAINT `2` FOREIGN KEY (`resource_id`) REFERENCES `resource_crdts` (`id`) ON UPDATE NO ACTION ON DELETE CASCADE
);
-- Create "resources" table
CREATE TABLE `resources` (
  `id` text NULL,
  `current_crdt_frontier` json NOT NULL,
  `handle` text NOT NULL,
  `url` text NOT NULL,
  `url_state` text NOT NULL,
  `last_checked_at` text NULL,
  `format` text NOT NULL,
  `thumbnail_image_id` text NULL,
  `created_at` text NOT NULL,
  `updated_at` text NOT NULL,
  PRIMARY KEY (`id`),
  CONSTRAINT `0` FOREIGN KEY (`thumbnail_image_id`) REFERENCES `images` (`id`) ON UPDATE NO ACTION ON DELETE SET NULL,
  CONSTRAINT `1` FOREIGN KEY (`id`) REFERENCES `resource_crdts` (`id`) ON UPDATE NO ACTION ON DELETE CASCADE
);
-- Create index "resources_handle" to table: "resources"
CREATE UNIQUE INDEX `resources_handle` ON `resources` (`handle`);
-- Create index "resources_url" to table: "resources"
CREATE UNIQUE INDEX `resources_url` ON `resources` (`url`);
-- Create index "idx_resources_handle" to table: "resources"
CREATE INDEX `idx_resources_handle` ON `resources` (`handle`);
-- Create "resource_translations" table
CREATE TABLE `resource_translations` (
  `resource_id` text NOT NULL,
  `locale` text NOT NULL,
  `title` text NOT NULL,
  `description` json NULL,
  `credit_line` text NULL,
  `translated_at_crdt_frontier` json NOT NULL,
  `translation_source` text NOT NULL,
  `original_locale` text NOT NULL,
  PRIMARY KEY (`resource_id`, `locale`),
  CONSTRAINT `0` FOREIGN KEY (`resource_id`) REFERENCES `resource_crdts` (`id`) ON UPDATE NO ACTION ON DELETE CASCADE
) WITHOUT ROWID;
-- Create "resource_tags" table
CREATE TABLE `resource_tags` (
  `resource_id` text NOT NULL,
  `tag_id` text NOT NULL,
  PRIMARY KEY (`resource_id`, `tag_id`),
  CONSTRAINT `0` FOREIGN KEY (`tag_id`) REFERENCES `tags` (`id`) ON UPDATE NO ACTION ON DELETE CASCADE,
  CONSTRAINT `1` FOREIGN KEY (`resource_id`) REFERENCES `resource_crdts` (`id`) ON UPDATE NO ACTION ON DELETE CASCADE
) WITHOUT ROWID;
-- Create "resource_vegetables" table
CREATE TABLE `resource_vegetables` (
  `resource_id` text NOT NULL,
  `vegetable_id` text NOT NULL,
  `order_index` integer NULL,
  PRIMARY KEY (`resource_id`, `vegetable_id`),
  CONSTRAINT `0` FOREIGN KEY (`vegetable_id`) REFERENCES `vegetable_crdts` (`id`) ON UPDATE NO ACTION ON DELETE CASCADE,
  CONSTRAINT `1` FOREIGN KEY (`resource_id`) REFERENCES `resource_crdts` (`id`) ON UPDATE NO ACTION ON DELETE CASCADE
) WITHOUT ROWID;
-- Create "post_crdts" table
CREATE TABLE `post_crdts` (
  `id` text NOT NULL,
  `crdt_snapshot` blob NOT NULL,
  `classification` json NULL,
  `owner_profile_id` text NOT NULL,
  `created_at` text NOT NULL,
  `updated_at` text NOT NULL,
  PRIMARY KEY (`id`),
  CONSTRAINT `0` FOREIGN KEY (`owner_profile_id`) REFERENCES `profiles` (`id`) ON UPDATE NO ACTION ON DELETE CASCADE
) WITHOUT ROWID;
-- Create "post_commits" table
CREATE TABLE `post_commits` (
  `id` text NULL,
  `post_id` text NOT NULL,
  `created_by_id` text NULL,
  `from_crdt_frontier` json NOT NULL,
  `crdt_update` blob NOT NULL,
  `updated_at` text NOT NULL,
  `created_at` text NOT NULL,
  PRIMARY KEY (`id`),
  CONSTRAINT `0` FOREIGN KEY (`created_by_id`) REFERENCES `people` (`id`) ON UPDATE NO ACTION ON DELETE SET NULL,
  CONSTRAINT `1` FOREIGN KEY (`post_id`) REFERENCES `post_crdts` (`id`) ON UPDATE NO ACTION ON DELETE CASCADE
);
-- Create "posts" table
CREATE TABLE `posts` (
  `id` text NULL,
  `current_crdt_frontier` json NOT NULL,
  `handle` text NOT NULL,
  `visibility` text NULL,
  `published_at` text NULL,
  `created_at` text NOT NULL,
  `updated_at` text NOT NULL,
  `owner_profile_id` text NOT NULL,
  `kind` text NOT NULL,
  `start_date` text NULL,
  `end_date` text NULL,
  `location_or_url` text NULL,
  `attendance_mode` text NULL,
  PRIMARY KEY (`id`),
  CONSTRAINT `0` FOREIGN KEY (`owner_profile_id`) REFERENCES `profiles` (`id`) ON UPDATE NO ACTION ON DELETE CASCADE,
  CONSTRAINT `1` FOREIGN KEY (`id`) REFERENCES `post_crdts` (`id`) ON UPDATE NO ACTION ON DELETE CASCADE
);
-- Create index "posts_handle" to table: "posts"
CREATE UNIQUE INDEX `posts_handle` ON `posts` (`handle`);
-- Create index "idx_posts_handle" to table: "posts"
CREATE INDEX `idx_posts_handle` ON `posts` (`handle`);
-- Create index "idx_posts_kind" to table: "posts"
CREATE INDEX `idx_posts_kind` ON `posts` (`kind`);
-- Create "post_translations" table
CREATE TABLE `post_translations` (
  `post_id` text NOT NULL,
  `locale` text NOT NULL,
  `content` json NOT NULL,
  `content_plain_text` text NOT NULL,
  `translated_at_crdt_frontier` json NOT NULL,
  `translation_source` text NOT NULL,
  `original_locale` text NOT NULL,
  PRIMARY KEY (`post_id`, `locale`),
  CONSTRAINT `0` FOREIGN KEY (`post_id`) REFERENCES `post_crdts` (`id`) ON UPDATE NO ACTION ON DELETE CASCADE
) WITHOUT ROWID;
-- Create "post_tags" table
CREATE TABLE `post_tags` (
  `post_id` text NOT NULL,
  `tag_id` text NOT NULL,
  `extraction_text` text NULL,
  PRIMARY KEY (`post_id`, `tag_id`),
  CONSTRAINT `0` FOREIGN KEY (`tag_id`) REFERENCES `tags` (`id`) ON UPDATE NO ACTION ON DELETE CASCADE,
  CONSTRAINT `1` FOREIGN KEY (`post_id`) REFERENCES `post_crdts` (`id`) ON UPDATE NO ACTION ON DELETE CASCADE
) WITHOUT ROWID;
-- Create "post_vegetables" table
CREATE TABLE `post_vegetables` (
  `post_id` text NOT NULL,
  `vegetable_id` text NOT NULL,
  `extraction_text` text NULL,
  PRIMARY KEY (`post_id`, `vegetable_id`),
  CONSTRAINT `0` FOREIGN KEY (`vegetable_id`) REFERENCES `vegetable_crdts` (`id`) ON UPDATE NO ACTION ON DELETE CASCADE,
  CONSTRAINT `1` FOREIGN KEY (`post_id`) REFERENCES `post_crdts` (`id`) ON UPDATE NO ACTION ON DELETE CASCADE
) WITHOUT ROWID;
-- Create "comment_crdts" table
CREATE TABLE `comment_crdts` (
  `id` text NULL,
  `post_id` text NULL,
  `resource_id` text NULL,
  `parent_comment_id` text NULL,
  `crdt_snapshot` blob NOT NULL,
  `owner_profile_id` text NOT NULL,
  `moderation_status` text NULL,
  `created_at` text NOT NULL,
  `updated_at` text NOT NULL,
  PRIMARY KEY (`id`),
  CONSTRAINT `0` FOREIGN KEY (`owner_profile_id`) REFERENCES `profiles` (`id`) ON UPDATE NO ACTION ON DELETE CASCADE,
  CONSTRAINT `1` FOREIGN KEY (`parent_comment_id`) REFERENCES `comment_crdts` (`id`) ON UPDATE NO ACTION ON DELETE CASCADE,
  CONSTRAINT `2` FOREIGN KEY (`resource_id`) REFERENCES `resource_crdts` (`id`) ON UPDATE NO ACTION ON DELETE CASCADE,
  CONSTRAINT `3` FOREIGN KEY (`post_id`) REFERENCES `post_crdts` (`id`) ON UPDATE NO ACTION ON DELETE CASCADE,
  CONSTRAINT `check_comment_parent` CHECK (
    (post_id IS NOT NULL) + (resource_id IS NOT NULL) = 1
  )
);
-- Create "comment_commits" table
CREATE TABLE `comment_commits` (
  `id` text NULL,
  `comment_id` text NULL,
  `created_by_id` text NULL,
  `from_crdt_frontier` json NOT NULL,
  `crdt_update` blob NOT NULL,
  `created_at` text NOT NULL,
  PRIMARY KEY (`id`),
  CONSTRAINT `0` FOREIGN KEY (`created_by_id`) REFERENCES `people` (`id`) ON UPDATE NO ACTION ON DELETE SET NULL,
  CONSTRAINT `1` FOREIGN KEY (`comment_id`) REFERENCES `comment_crdts` (`id`) ON UPDATE NO ACTION ON DELETE CASCADE
);
-- Create "comments" table
CREATE TABLE `comments` (
  `id` text NULL,
  `post_id` text NULL,
  `resource_id` text NULL,
  `parent_comment_id` text NULL,
  `current_crdt_frontier` json NOT NULL,
  `moderation_status` text NULL,
  `created_at` text NOT NULL,
  `updated_at` text NOT NULL,
  `owner_profile_id` text NOT NULL,
  PRIMARY KEY (`id`),
  CONSTRAINT `0` FOREIGN KEY (`resource_id`) REFERENCES `resource_crdts` (`id`) ON UPDATE NO ACTION ON DELETE CASCADE,
  CONSTRAINT `1` FOREIGN KEY (`post_id`) REFERENCES `post_crdts` (`id`) ON UPDATE NO ACTION ON DELETE CASCADE,
  CONSTRAINT `2` FOREIGN KEY (`owner_profile_id`) REFERENCES `profiles` (`id`) ON UPDATE NO ACTION ON DELETE CASCADE,
  CONSTRAINT `3` FOREIGN KEY (`id`) REFERENCES `comment_crdts` (`id`) ON UPDATE NO ACTION ON DELETE CASCADE,
  CONSTRAINT `check_comment_parent` CHECK (
    (post_id IS NOT NULL) + (resource_id IS NOT NULL) = 1
  )
);
-- Create "comment_translations" table
CREATE TABLE `comment_translations` (
  `comment_id` text NOT NULL,
  `locale` text NOT NULL,
  `content` json NOT NULL,
  `content_plain_text` text NOT NULL,
  `translated_at_crdt_frontier` json NOT NULL,
  `translation_source` text NOT NULL,
  `original_locale` text NOT NULL,
  PRIMARY KEY (`comment_id`, `locale`),
  CONSTRAINT `0` FOREIGN KEY (`comment_id`) REFERENCES `comment_crdts` (`id`) ON UPDATE NO ACTION ON DELETE CASCADE
) WITHOUT ROWID;
-- Create "bookmarks_vegetables" table
CREATE TABLE `bookmarks_vegetables` (
  `person_id` text NOT NULL,
  `vegetable_id` text NOT NULL,
  `state` text NOT NULL,
  PRIMARY KEY (`person_id`, `vegetable_id`),
  CONSTRAINT `0` FOREIGN KEY (`vegetable_id`) REFERENCES `vegetable_crdts` (`id`) ON UPDATE NO ACTION ON DELETE CASCADE,
  CONSTRAINT `1` FOREIGN KEY (`person_id`) REFERENCES `people` (`id`) ON UPDATE NO ACTION ON DELETE CASCADE
) WITHOUT ROWID;
-- Create "bookmarks_resources" table
CREATE TABLE `bookmarks_resources` (
  `person_id` text NOT NULL,
  `resource_id` text NOT NULL,
  `state` text NOT NULL,
  PRIMARY KEY (`person_id`, `resource_id`),
  CONSTRAINT `0` FOREIGN KEY (`resource_id`) REFERENCES `resource_crdts` (`id`) ON UPDATE NO ACTION ON DELETE CASCADE,
  CONSTRAINT `1` FOREIGN KEY (`person_id`) REFERENCES `people` (`id`) ON UPDATE NO ACTION ON DELETE CASCADE
) WITHOUT ROWID;
