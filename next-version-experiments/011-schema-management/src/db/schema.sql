-- ===========
-- BETTER AUTH
-- ===========
CREATE TABLE accounts (
    id text NOT NULL PRIMARY KEY,
    name text NOT NULL,
    email text NOT NULL UNIQUE,
    is_email_verified integer NOT NULL,
    image text,
    created_at text NOT NULL,
    updated_at text NOT NULL
);

CREATE TABLE sessions (
    id text NOT NULL PRIMARY KEY,
    expires_at date NOT NULL,
    token text NOT NULL UNIQUE,
    created_at text NOT NULL,
    updated_at text NOT NULL,
    ip_address text,
    user_agent text,
    user_id text NOT NULL REFERENCES accounts (id) ON DELETE CASCADE
);

CREATE TABLE oauth_accounts (
    id text NOT NULL PRIMARY KEY,
    account_id text NOT NULL,
    provider_id text NOT NULL,
    user_id text NOT NULL REFERENCES accounts (id) ON DELETE CASCADE,
    access_token text,
    refresh_token text,
    id_token text,
    access_token_expires_at text,
    refresh_token_expires_at text,
    scope text,
    password text,
    created_at text NOT NULL,
    updated_at text NOT NULL
);

CREATE TABLE verifications (
    id text NOT NULL PRIMARY KEY,
    identifier text NOT NULL,
    value text NOT NULL,
    expires_at text NOT NULL,
    created_at text NOT NULL,
    updated_at text NOT NULL
);

CREATE INDEX session_user_id_idx ON sessions (user_id);

CREATE INDEX account_user_id_idx ON oauth_accounts (user_id);

CREATE INDEX verification_identifier_idx ON verifications (identifier);

-- ========
-- PROFILES
-- ========
CREATE TABLE profiles (
    id text NOT NULL PRIMARY KEY,
    type text NOT NULL, -- 'person' | 'organization'
    handle text NOT NULL UNIQUE,
    name text NOT NULL,
    bio json, -- Tiptap rich text
    location text,
    photo_id text,
    visibility text NOT NULL, -- ProfileVisibility
    created_at text,
    updated_at text,
    FOREIGN KEY (photo_id) REFERENCES images (id) ON DELETE SET NULL
);

CREATE INDEX idx_profiles_handle ON profiles (handle);

CREATE TABLE people (
    id text PRIMARY KEY,
    role text NOT NULL, -- PlatformRole
    community_access text NOT NULL, -- CommunityAccess
    -- People's ids are the same as the corresponding id in `profiles` and `users`
    FOREIGN KEY (id) REFERENCES profiles (id) ON DELETE CASCADE,
    FOREIGN KEY (id) REFERENCES accounts (id) ON DELETE CASCADE
);

CREATE TABLE organizations (
    id text PRIMARY KEY,
    type text NOT NULL, -- OrganizationType
    members_visibility text NOT NULL, -- InformationVisibility
    FOREIGN KEY (id) REFERENCES profiles (id) ON DELETE CASCADE
);

-- ========================
-- ORGANIZATION MEMBERSHIPS
-- ========================
CREATE TABLE organization_memberships (
    person_id text NOT NULL,
    organization_id text NOT NULL,
    permissions text NOT NULL, -- OrganizationPermission
    created_at text,
    updated_at text,
    PRIMARY KEY (person_id, organization_id),
    FOREIGN KEY (person_id) REFERENCES people (id) ON DELETE CASCADE,
    FOREIGN KEY (organization_id) REFERENCES organizations (id) ON DELETE CASCADE
) WITHOUT ROWID;

-- ========================
-- ORGANIZATION INVITATIONS
-- ========================
CREATE TABLE organization_invitations (
    id text NOT NULL PRIMARY KEY,
    organization_id text NOT NULL,
    email text NOT NULL,
    permissions text NOT NULL, -- OrganizationPermission
    status text NOT NULL, -- OrganizationInvitationStatus
    created_by_id text NOT NULL,
    created_at text,
    updated_at text,
    UNIQUE (organization_id, email),
    FOREIGN KEY (organization_id) REFERENCES organizations (id) ON DELETE CASCADE,
    FOREIGN KEY (created_by_id) REFERENCES people (id) ON DELETE CASCADE
);

-- ====
-- TAGS
-- ====
CREATE TABLE tags (
    handle text NOT NULL UNIQUE,
    names json NOT NULL,
    description json, -- Tiptap rich text
    cluster text,
    created_at text,
    updated_at text,
    created_by_id text
);

CREATE INDEX idx_tags_handle ON tags (handle);

-- ======
-- IMAGES
-- ======
CREATE TABLE images (
    id text PRIMARY KEY,
    sanity_id text NOT NULL UNIQUE,
    label text,
    hotspot json,
    crop json,
    metadata json,
    created_at text,
    updated_at text,
    owner_profile_id text NOT NULL,
    FOREIGN KEY (owner_profile_id) REFERENCES profiles (id) ON DELETE CASCADE
);

CREATE TABLE image_credits (
    image_id text NOT NULL,
    order_index integer NOT NULL,
    credit_line text,
    credit_url text,
    person_id text,
    PRIMARY KEY (image_id, order_index),
    FOREIGN KEY (image_id) REFERENCES images (id) ON DELETE CASCADE,
    FOREIGN KEY (person_id) REFERENCES people (id) ON DELETE CASCADE
) WITHOUT ROWID;

-- ==========
-- VEGETABLES
-- ==========
--
-- The source of truth of core vegetable data (except photos and varieties)
CREATE TABLE vegetable_crdts (
    id text PRIMARY KEY,
    loro_crdt blob NOT NULL,
    created_at text,
    updated_at text
) WITHOUT ROWID;

-- People's edit suggestions that compose the encyclopedia
CREATE TABLE vegetable_revisions (
    id text PRIMARY KEY,
    vegetable_id text,
    created_by_id text,
    crdt_update blob NOT NULL,
    evaluation text NOT NULL, -- RevisionEvaluation
    evaluated_by_id text,
    evaluated_at text,
    created_at text,
    updated_at text,
    FOREIGN KEY (vegetable_id) REFERENCES vegetable_crdts (id) ON DELETE CASCADE,
    FOREIGN KEY (created_by_id) REFERENCES people (id) ON DELETE SET NULL,
    FOREIGN KEY (evaluated_by_id) REFERENCES people (id) ON DELETE SET NULL
);

-- The core queryable data, materialized from the CRDT
CREATE TABLE vegetables (
    id text PRIMARY KEY,
    current_crdt_frontier json NOT NULL,
    handle text NOT NULL UNIQUE,
    scientific_names json, -- string[]
    development_cycle_min integer,
    development_cycle_max integer,
    height_min real,
    height_max real,
    temperature_min real,
    temperature_max real,
    chinese_medicine_element text, -- ChineseMedicineElement
    main_photo_id text,
    FOREIGN KEY (id) REFERENCES vegetable_crdts (id) ON DELETE CASCADE,
    FOREIGN KEY (main_photo_id) REFERENCES images (id) ON DELETE SET NULL
);

CREATE INDEX idx_vegetables_handle ON vegetables (handle);

-- Per-locale data, materialized from the CRDT
CREATE TABLE vegetable_translations (
    vegetable_id text NOT NULL,
    locale text NOT NULL, -- SupportedLocale
    common_names json NOT NULL, -- string[]
    searchable_names text, -- includes scientific names for better FTS search
    grammatical_gender text, -- GrammaticalGender
    origin text,
    content json, -- Tiptap rich text
    PRIMARY KEY (vegetable_id, locale),
    FOREIGN KEY (vegetable_id) REFERENCES vegetable_crdts (id) ON DELETE CASCADE
) WITHOUT ROWID;

CREATE INDEX idx_vegetables_searchable_names ON vegetable_translations (searchable_names);

CREATE TABLE vegetable_strata (
    vegetable_id text NOT NULL,
    stratum text NOT NULL,
    PRIMARY KEY (vegetable_id, stratum),
    FOREIGN KEY (vegetable_id) REFERENCES vegetable_crdts (id) ON DELETE CASCADE
) WITHOUT ROWID;

CREATE TABLE vegetable_planting_methods (
    vegetable_id text NOT NULL,
    planting_method text NOT NULL,
    PRIMARY KEY (vegetable_id, planting_method),
    FOREIGN KEY (vegetable_id) REFERENCES vegetable_crdts (id) ON DELETE CASCADE
) WITHOUT ROWID;

CREATE TABLE vegetable_edible_parts (
    vegetable_id text NOT NULL,
    edible_part text NOT NULL,
    PRIMARY KEY (vegetable_id, edible_part),
    FOREIGN KEY (vegetable_id) REFERENCES vegetable_crdts (id) ON DELETE CASCADE
) WITHOUT ROWID;

CREATE TABLE vegetable_lifecycles (
    vegetable_id text NOT NULL,
    lifecycle text NOT NULL,
    PRIMARY KEY (vegetable_id, lifecycle),
    FOREIGN KEY (vegetable_id) REFERENCES vegetable_crdts (id) ON DELETE CASCADE
) WITHOUT ROWID;

CREATE TABLE vegetable_uses (
    vegetable_id text NOT NULL,
    usage text NOT NULL,
    PRIMARY KEY (vegetable_id, usage),
    FOREIGN KEY (vegetable_id) REFERENCES vegetable_crdts (id) ON DELETE CASCADE
) WITHOUT ROWID;

-- ===================
-- VEGETABLE VARIETIES
-- ===================
CREATE TABLE vegetable_varieties (
    id text PRIMARY KEY,
    vegetable_id text NOT NULL,
    handle text NOT NULL UNIQUE,
    scientific_names json, -- string[]
    created_at text,
    updated_at text,
    created_by_id text,
    FOREIGN KEY (vegetable_id) REFERENCES vegetable_crdts (id) ON DELETE CASCADE
);

CREATE INDEX idx_vegetable_varieties_handle ON vegetable_varieties (handle);

CREATE TABLE vegetable_variety_translations (
    variety_id text NOT NULL,
    locale text NOT NULL, -- SupportedLocale
    common_names json NOT NULL, -- string[]
    content json, -- Tiptap rich text
    PRIMARY KEY (variety_id, locale),
    FOREIGN KEY (variety_id) REFERENCES vegetable_varieties (id) ON DELETE CASCADE
) WITHOUT ROWID;

CREATE TABLE vegetable_variety_photos (
    variety_id text NOT NULL,
    image_id text NOT NULL,
    order_index integer,
    PRIMARY KEY (variety_id, image_id),
    FOREIGN KEY (variety_id) REFERENCES vegetable_varieties (id) ON DELETE CASCADE,
    FOREIGN KEY (image_id) REFERENCES images (id) ON DELETE CASCADE
) WITHOUT ROWID;

-- ================
-- VEGETABLE PHOTOS
-- ================
CREATE TABLE vegetable_photos (
    vegetable_id text NOT NULL,
    image_id text NOT NULL,
    order_index integer,
    PRIMARY KEY (vegetable_id, image_id),
    FOREIGN KEY (vegetable_id) REFERENCES vegetable_crdts (id) ON DELETE CASCADE,
    FOREIGN KEY (image_id) REFERENCES images (id) ON DELETE CASCADE
) WITHOUT ROWID;

-- Metadata for images used as vegetable photos
-- (one row per unique image; not all images are in this table)
CREATE TABLE vegetable_photo_metadata (
    id text PRIMARY KEY,
    category text NOT NULL, -- app-controlled: 'seed', 'seedling', 'fruit', etc.
    description json, -- Tiptap rich text
    moderation_status text, -- ModerationStatus
    created_at text,
    updated_at text,
    FOREIGN KEY (id) REFERENCES images (id) ON DELETE CASCADE
);

-- =========
-- RESOURCES
-- =========
--
-- The source of truth of all resource data
CREATE TABLE resource_crdts (
    id text PRIMARY KEY,
    loro_crdt blob NOT NULL,
    created_at text,
    updated_at text
) WITHOUT ROWID;

-- People's edit suggestions that compose the library
CREATE TABLE resource_revisions (
    id text PRIMARY KEY,
    resource_id text,
    created_by_id text,
    crdt_update blob NOT NULL,
    evaluation text NOT NULL, -- RevisionEvaluation
    evaluated_by_id text,
    evaluated_at text,
    created_at text,
    updated_at text,
    FOREIGN KEY (resource_id) REFERENCES resource_crdts (id) ON DELETE CASCADE,
    FOREIGN KEY (created_by_id) REFERENCES people (id) ON DELETE SET NULL,
    FOREIGN KEY (evaluated_by_id) REFERENCES people (id) ON DELETE SET NULL
);

-- The core queryable data, materialized from the CRDT
CREATE TABLE resources (
    id text PRIMARY KEY,
    current_crdt_frontier json NOT NULL,
    handle text NOT NULL UNIQUE,
    url text NOT NULL UNIQUE,
    url_state text NOT NULL, -- ResourceURLState
    last_checked_at text,
    format text NOT NULL, -- ResourceFormat
    thumbnail_image_id text,
    created_at text,
    updated_at text,
    FOREIGN KEY (id) REFERENCES resource_crdts (id) ON DELETE CASCADE,
    FOREIGN KEY (thumbnail_image_id) REFERENCES images (id) ON DELETE SET NULL
);

CREATE INDEX idx_resources_handle ON resources (handle);

-- Per-locale data, materialized from the CRDT
CREATE TABLE resource_translations (
    resource_id text NOT NULL,
    locale text NOT NULL, -- SupportedLocale
    title text NOT NULL,
    description json, -- Tiptap Rich Text
    credit_line text,
    translated_at_crdt_frontier json NOT NULL,
    translation_source text NOT NULL, -- Original, Automatic, Manual
    original_locale text NOT NULL, -- SupportedLocale
    PRIMARY KEY (resource_id, locale),
    FOREIGN KEY (resource_id) REFERENCES resource_crdts (id) ON DELETE CASCADE
) WITHOUT ROWID;

CREATE TABLE resource_tags (
    resource_id text NOT NULL,
    tag_id text NOT NULL,
    PRIMARY KEY (resource_id, tag_id),
    FOREIGN KEY (resource_id) REFERENCES resource_crdts (id) ON DELETE CASCADE,
    FOREIGN KEY (tag_id) REFERENCES tags (id) ON DELETE CASCADE
) WITHOUT ROWID;

CREATE TABLE resource_vegetables (
    resource_id text NOT NULL,
    vegetable_id text NOT NULL,
    order_index integer,
    PRIMARY KEY (resource_id, vegetable_id),
    FOREIGN KEY (resource_id) REFERENCES resource_crdts (id) ON DELETE CASCADE,
    FOREIGN KEY (vegetable_id) REFERENCES vegetable_crdts (id) ON DELETE CASCADE
) WITHOUT ROWID;

-- =====
-- POSTS
-- =====
--
-- The source of truth of all post data
CREATE TABLE post_crdts (
    id text PRIMARY KEY,
    loro_crdt blob NOT NULL,
    owner_profile_id text NOT NULL,
    created_at text,
    updated_at text,
    FOREIGN KEY (owner_profile_id) REFERENCES profiles (id) ON DELETE CASCADE
) WITHOUT ROWID;

-- How posts are modified
CREATE TABLE post_commits (
    id text PRIMARY KEY,
    post_id text,
    created_by_id text,
    from_crdt_frontier json NOT NULL,
    crdt_update blob NOT NULL,
    created_at text,
    FOREIGN KEY (post_id) REFERENCES post_crdts (id) ON DELETE CASCADE,
    FOREIGN KEY (created_by_id) REFERENCES people (id) ON DELETE SET NULL
);

-- The core queryable data, materialized from the CRDT
CREATE TABLE posts (
    id text PRIMARY KEY,
    current_crdt_frontier json NOT NULL,
    handle text NOT NULL UNIQUE,
    visibility text, -- InformationVisibility
    published_at text,
    created_at text,
    updated_at text,
    owner_profile_id text NOT NULL,
    type text NOT NULL, -- EventType

    -- EVENT ONLY - enforced in application level:
    start_date text,
    end_date text,
    location_or_url text,
    attendance_mode text, -- EventAttendanceMode
    FOREIGN KEY (id) REFERENCES post_crdts (id) ON DELETE CASCADE,
    FOREIGN KEY (owner_profile_id) REFERENCES profiles (id) ON DELETE CASCADE
);

CREATE INDEX idx_posts_handle ON posts (handle);
CREATE INDEX idx_posts_type ON posts (type);

CREATE TABLE post_translations (
    post_id text NOT NULL,
    locale text NOT NULL, -- SupportedLocale
    content json NOT NULL, -- Tiptap Rich Text
    content_plain_text text NOT NULL,
    translated_at_crdt_frontier json NOT NULL,
    translation_source text NOT NULL, -- Original, Automatic, Manual
    original_locale text NOT NULL, -- SupportedLocale
    PRIMARY KEY (post_id, locale),
    FOREIGN KEY (post_id) REFERENCES post_crdts (id) ON DELETE CASCADE
) WITHOUT ROWID;

CREATE TABLE post_tags (
    post_id text NOT NULL,
    tag_id text NOT NULL,
    PRIMARY KEY (post_id, tag_id),
    FOREIGN KEY (post_id) REFERENCES post_crdts (id) ON DELETE CASCADE,
    FOREIGN KEY (tag_id) REFERENCES tags (id) ON DELETE CASCADE
) WITHOUT ROWID;

CREATE TABLE post_vegetables (
    post_id text NOT NULL,
    vegetable_id text NOT NULL,
    PRIMARY KEY (post_id, vegetable_id),
    FOREIGN KEY (post_id) REFERENCES post_crdts (id) ON DELETE CASCADE,
    FOREIGN KEY (vegetable_id) REFERENCES vegetable_crdts (id) ON DELETE CASCADE
) WITHOUT ROWID;

-- ========
-- COMMENTS
-- ========
--
-- The source of truth of all comment data
CREATE TABLE comment_crdts (
    id text PRIMARY KEY,
    post_id text,
    resource_id text,
    parent_comment_id text,
    loro_crdt blob NOT NULL,
    owner_profile_id text NOT NULL,
    moderation_status text, -- ModerationStatus
    created_at text,
    updated_at text,
    FOREIGN KEY (post_id) REFERENCES post_crdts (id) ON DELETE CASCADE,
    FOREIGN KEY (resource_id) REFERENCES resource_crdts (id) ON DELETE CASCADE,
    FOREIGN KEY (parent_comment_id) REFERENCES comment_crdts (id) ON DELETE CASCADE,
    FOREIGN KEY (owner_profile_id) REFERENCES profiles (id) ON DELETE CASCADE,
    -- Exactly one of `post_id` or `resource_id` is set:
    CONSTRAINT check_comment_parent CHECK (
        (post_id IS NOT NULL) + (resource_id IS NOT NULL) = 1
    )
);

-- How comments are modified
CREATE TABLE comment_commits (
    id text PRIMARY KEY,
    comment_id text,
    created_by_id text,
    from_crdt_frontier json NOT NULL,
    crdt_update blob NOT NULL,
    created_at text,
    FOREIGN KEY (comment_id) REFERENCES comment_crdts (id) ON DELETE CASCADE,
    FOREIGN KEY (created_by_id) REFERENCES people (id) ON DELETE SET NULL
);

-- The core queryable data, materialized from the CRDT
CREATE TABLE comments (
    id text PRIMARY KEY,
    post_id text,
    resource_id text,
    parent_comment_id text,
    current_crdt_frontier json NOT NULL,
    moderation_status text, -- ModerationStatus
    created_at text,
    updated_at text,
    owner_profile_id text NOT NULL,
    FOREIGN KEY (id) REFERENCES comment_crdts (id) ON DELETE CASCADE,
    FOREIGN KEY (owner_profile_id) REFERENCES profiles (id) ON DELETE CASCADE,
    FOREIGN KEY (post_id) REFERENCES post_crdts (id) ON DELETE CASCADE,
    FOREIGN KEY (resource_id) REFERENCES resource_crdts (id) ON DELETE CASCADE,
    -- Exactly one of `post_id` or `resource_id` is set:
    CONSTRAINT check_comment_parent CHECK (
        (post_id IS NOT NULL) + (resource_id IS NOT NULL) = 1
    )
);

CREATE TABLE comment_translations (
    comment_id text NOT NULL,
    locale text NOT NULL, -- SupportedLocale
    content json NOT NULL, -- Tiptap Rich Text
    content_plain_text text NOT NULL,
    translated_at_crdt_frontier json NOT NULL,
    translation_source text NOT NULL, -- Original, Automatic, Manual
    original_locale text NOT NULL, -- SupportedLocale
    PRIMARY KEY (comment_id, locale),
    FOREIGN KEY (comment_id) REFERENCES comment_crdts (id) ON DELETE CASCADE
) WITHOUT ROWID;

-- =========
-- BOOKMARKS
-- =========
CREATE TABLE bookmarks_vegetables (
    person_id text NOT NULL,
    vegetable_id text NOT NULL,
    state text NOT NULL, -- BookmarkState
    PRIMARY KEY (person_id, vegetable_id),
    FOREIGN KEY (person_id) REFERENCES people (id) ON DELETE CASCADE,
    FOREIGN KEY (vegetable_id) REFERENCES vegetable_crdts (id) ON DELETE CASCADE
) WITHOUT ROWID;

CREATE TABLE bookmarks_resources (
    person_id text NOT NULL,
    resource_id text NOT NULL,
    state text NOT NULL, -- BookmarkState
    PRIMARY KEY (person_id, resource_id),
    FOREIGN KEY (person_id) REFERENCES people (id) ON DELETE CASCADE,
    FOREIGN KEY (resource_id) REFERENCES resource_crdts (id) ON DELETE CASCADE
) WITHOUT ROWID;

-- =======
-- SYNCING
--
-- Exists only for tables that are local-first in people's device.
-- Logs that contain `relevant_to_profile_id` are for tables with partial sync - only data relevant to people who
-- have access to that profile will be synced.
-- =======
CREATE TABLE vegetables_sync_log (
    sequence_id integer PRIMARY KEY AUTOINCREMENT,
    vegetable_id text,
    operation text NOT NULL, -- SyncOperation
    changed_at text NOT NULL,
    FOREIGN KEY (vegetable_id) REFERENCES vegetable_crdts (id) ON DELETE SET NULL
);

CREATE TABLE posts_sync_log (
    sequence_id integer PRIMARY KEY AUTOINCREMENT,
    post_id text,
    operation text NOT NULL, -- SyncOperation
    changed_at text NOT NULL,
    relevant_to_profile_id text NOT NULL,
    FOREIGN KEY (post_id) REFERENCES post_crdts (id) ON DELETE SET NULL,
    FOREIGN KEY (relevant_to_profile_id) REFERENCES profiles (id) ON DELETE SET NULL
);

CREATE TABLE bookmarks_vegetables_sync_log (
    sequence_id integer PRIMARY KEY AUTOINCREMENT,
    vegetable_id text,
    operation text NOT NULL, -- SyncOperation
    changed_at text NOT NULL,
    relevant_to_profile_id text NOT NULL,
    FOREIGN KEY (vegetable_id) REFERENCES vegetable_crdts (id) ON DELETE SET NULL,
    FOREIGN KEY (relevant_to_profile_id) REFERENCES profiles (id) ON DELETE SET NULL
);

CREATE TABLE bookmarks_resources_sync_log (
    sequence_id integer PRIMARY KEY AUTOINCREMENT,
    resource_id text,
    operation text NOT NULL, -- SyncOperation
    changed_at text NOT NULL,
    relevant_to_profile_id text NOT NULL,
    FOREIGN KEY (resource_id) REFERENCES resource_crdts (id) ON DELETE SET NULL,
    FOREIGN KEY (relevant_to_profile_id) REFERENCES profiles (id) ON DELETE SET NULL
);
