-- ===========
-- BETTER AUTH
-- ===========
CREATE TABLE user (
    id text NOT NULL PRIMARY KEY,
    name text NOT NULL,
    email text NOT NULL UNIQUE,
    emailVerified integer NOT NULL,
    image text,
    createdAt date NOT NULL,
    updatedAt date NOT NULL
);

CREATE TABLE session (
    id text NOT NULL PRIMARY KEY,
    expiresAt date NOT NULL,
    token text NOT NULL UNIQUE,
    createdAt date NOT NULL,
    updatedAt date NOT NULL,
    ipAddress text,
    userAgent text,
    userId text NOT NULL REFERENCES user (id) ON DELETE CASCADE
);

CREATE TABLE account (
    id text NOT NULL PRIMARY KEY,
    accountId text NOT NULL,
    providerId text NOT NULL,
    userId text NOT NULL REFERENCES user (id) ON DELETE CASCADE,
    accessToken text,
    refreshToken text,
    idToken text,
    accessTokenExpiresAt date,
    refreshTokenExpiresAt date,
    scope text,
    password text,
    createdAt date NOT NULL,
    updatedAt date NOT NULL
);

CREATE TABLE verification (
    id text NOT NULL PRIMARY KEY,
    identifier text NOT NULL,
    value text NOT NULL,
    expiresAt date NOT NULL,
    createdAt date NOT NULL,
    updatedAt date NOT NULL
);

CREATE INDEX session_userId_idx ON session (userId);

CREATE INDEX account_userId_idx ON account (userId);

CREATE INDEX verification_identifier_idx ON verification (identifier);

-- ========
-- PROFILES
-- ========
CREATE TABLE people (
    id text NOT NULL PRIMARY KEY,
    handle text NOT NULL UNIQUE,
    name text NOT NULL,
    bio json, -- Tiptap rich text
    location text, -- @TODO need to figure out a nice balance of free-form and structure to allow expressivity, privacy, and geospatial querying
    photo_id text,
    created_at text DEFAULT (datetime('now')),
    updated_at text DEFAULT (datetime('now')),
    FOREIGN KEY (id) REFERENCES user (id) ON DELETE CASCADE,
    FOREIGN KEY (photo_id) REFERENCES images (id) ON DELETE SET NULL
);

CREATE INDEX idx_people_handle ON people (handle);

CREATE TABLE organizations (
    id text NOT NULL PRIMARY KEY,
    handle text NOT NULL UNIQUE,
    name text NOT NULL,
    bio json, -- Tiptap rich text
    location text, -- @TODO need to figure out a nice balance of free-form and structure to allow expressivity, privacy, and geospatial querying
    photo_id text,
    created_at text DEFAULT (datetime('now')),
    updated_at text DEFAULT (datetime('now')),
    FOREIGN KEY (photo_id) REFERENCES images (id) ON DELETE SET NULL
);

CREATE INDEX idx_organizations_handle ON organizations (handle);

-- ========================
-- ORGANIZATION MEMBERSHIPS
-- ========================
CREATE TABLE organization_memberships (
    user_profile_id text NOT NULL,
    organization_id text NOT NULL,
    permissions text NOT NULL, -- OrganizationPermission
    created_at text DEFAULT (datetime('now')),
    updated_at text DEFAULT (datetime('now')),
    PRIMARY KEY (user_profile_id, organization_id),
    FOREIGN KEY (user_profile_id) REFERENCES people (id) ON DELETE CASCADE,
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
    created_by_id text NOT NULL,
    created_at text DEFAULT (datetime('now')),
    updated_at text DEFAULT (datetime('now')),
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
    created_at text DEFAULT (datetime('now')),
    updated_at text DEFAULT (datetime('now')),
    created_by_id text
);

CREATE INDEX idx_tags_handle ON tags (handle);

-- ======
-- IMAGES
-- ======
CREATE TABLE images (
    sanity_id text NOT NULL UNIQUE,
    label text,
    hotspot json,
    crop json,
    metadata json,
    created_at text DEFAULT (datetime('now')),
    updated_at text DEFAULT (datetime('now')),
    submitted_by_person_id text,
    FOREIGN KEY (submitted_by_person_id) REFERENCES people (id)
);

CREATE TABLE image_credits (
    image_id integer NOT NULL,
    order_index integer NOT NULL,
    credit_line text,
    credit_url text,
    person_id integer,
    PRIMARY KEY (image_id, order_index),
    FOREIGN KEY (image_id) REFERENCES images (id) ON DELETE CASCADE,
    FOREIGN KEY (person_id) REFERENCES people (id) ON DELETE CASCADE
) WITHOUT ROWID;

-- ==========
-- VEGETABLES
-- ==========
-- The source of truth of core vegetable data (except photos and varieties)
CREATE TABLE vegetable_crdts (
    id text PRIMARY KEY,
    loro_crdt blob NOT NULL,
    created_at text DEFAULT (datetime('now')),
    updated_at text DEFAULT (datetime('now'))
) WITHOUT ROWID;

-- People's edit suggestions that compose the encyclopedia
CREATE TABLE vegetable_revisions (
    id text PRIMARY KEY,
    vegetable_crdt_id text,
    created_by_id text,
    from_crdt_frontier json NOT NULL,
    diff json NOT NULL,
    approval_status text NOT NULL, -- ApprovalStatus
    created_at text DEFAULT (datetime('now')),
    updated_at text DEFAULT (datetime('now')),
    FOREIGN KEY (vegetable_crdt_id) REFERENCES vegetable_crdts (id) ON DELETE CASCADE,
    FOREIGN KEY (created_by_id) REFERENCES people (id) ON DELETE SET NULL
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
    main_photo_id text,
    FOREIGN KEY (id) REFERENCES vegetable_crdts (id) ON DELETE CASCADE,
    FOREIGN KEY (main_photo_id) REFERENCES images (id) ON DELETE SET NULL
);

CREATE INDEX idx_vegetables_handle ON vegetables (handle);

-- Per-locale data, materialized from the CRDT
CREATE TABLE vegetable_translations (
    vegetable_id text NOT NULL,
    locale text NOT NULL, -- SupportedLocale
    names json NOT NULL, -- string[]
    searchable_names text, -- includes scientific names for better FTS search
    gender text, -- Gender
    origin text,
    content json, -- Tiptap rich text
    PRIMARY KEY (vegetable_id, locale),
    FOREIGN KEY (vegetable_id) REFERENCES vegetables (id) ON DELETE CASCADE
) WITHOUT ROWID;

CREATE INDEX idx_vegetables_searchable_names ON vegetable_translations (searchable_names);

CREATE TABLE vegetable_strata (
    vegetable_id text NOT NULL,
    stratum text NOT NULL,
    PRIMARY KEY (vegetable_id, stratum),
    FOREIGN KEY (vegetable_id) REFERENCES vegetables (id) ON DELETE CASCADE
) WITHOUT ROWID;

CREATE TABLE vegetable_planting_methods (
    vegetable_id text NOT NULL,
    planting_method text NOT NULL,
    PRIMARY KEY (vegetable_id, planting_method),
    FOREIGN KEY (vegetable_id) REFERENCES vegetables (id) ON DELETE CASCADE
) WITHOUT ROWID;

CREATE TABLE vegetable_edible_parts (
    vegetable_id text NOT NULL,
    edible_part text NOT NULL,
    PRIMARY KEY (vegetable_id, edible_part),
    FOREIGN KEY (vegetable_id) REFERENCES vegetables (id) ON DELETE CASCADE
) WITHOUT ROWID;

CREATE TABLE vegetable_lifecycles (
    vegetable_id text NOT NULL,
    lifecycle text NOT NULL,
    PRIMARY KEY (vegetable_id, lifecycle),
    FOREIGN KEY (vegetable_id) REFERENCES vegetables (id) ON DELETE CASCADE
) WITHOUT ROWID;

CREATE TABLE vegetable_uses (
    vegetable_id text NOT NULL,
    usage text NOT NULL,
    PRIMARY KEY (vegetable_id, usage),
    FOREIGN KEY (vegetable_id) REFERENCES vegetables (id) ON DELETE CASCADE
) WITHOUT ROWID;

-- ===================
-- VEGETABLE VARIETIES
-- ===================
CREATE TABLE vegetable_varieties (
    vegetable_id text NOT NULL,
    handle text NOT NULL UNIQUE,
    created_at text DEFAULT (datetime('now')),
    updated_at text DEFAULT (datetime('now')),
    created_by_id text,
    FOREIGN KEY (vegetable_id) REFERENCES vegetables (id) ON DELETE CASCADE
);

CREATE INDEX idx_vegetable_varieties_handle ON vegetable_varieties (handle);

CREATE TABLE vegetable_variety_translations (
    variety_id text NOT NULL,
    locale text NOT NULL, -- SupportedLocale
    names json NOT NULL, -- string[]
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
    FOREIGN KEY (vegetable_id) REFERENCES vegetables (id) ON DELETE CASCADE,
    FOREIGN KEY (image_id) REFERENCES images (id) ON DELETE CASCADE
) WITHOUT ROWID;

-- Metadata for images used as vegetable photos
-- (one row per unique image; not all images are in this table)
CREATE TABLE vegetable_photo_metadata (
    id text PRIMARY KEY,
    category text NOT NULL, -- app-controlled: 'seed', 'seedling', 'fruit', etc.
    description json, -- Tiptap rich text
    approval_status text, -- ApprovalStatus
    created_at text DEFAULT (datetime('now')),
    updated_at text DEFAULT (datetime('now')),
    FOREIGN KEY (id) REFERENCES images (id) ON DELETE CASCADE
);

-- =====
-- NOTES
-- =====
-- The source of truth of all note data
CREATE TABLE note_crdts (
    id text PRIMARY KEY,
    loro_crdt blob NOT NULL,
    created_at text DEFAULT (datetime('now')),
    updated_at text DEFAULT (datetime('now'))
) WITHOUT ROWID;

-- How notes are modified after being published
CREATE TABLE note_revisions (
    id text PRIMARY KEY,
    note_crdt_id text,
    created_by_id text,
    from_crdt_frontier json NOT NULL,
    diff json NOT NULL,
    approval_status text NOT NULL, -- ApprovalStatus
    created_at text DEFAULT (datetime('now')),
    updated_at text DEFAULT (datetime('now')),
    FOREIGN KEY (note_crdt_id) REFERENCES note_crdts (id) ON DELETE CASCADE,
    FOREIGN KEY (created_by_id) REFERENCES people (id) ON DELETE SET NULL
);

-- The core queryable data, materialized from the CRDT
CREATE TABLE notes (
    id text PRIMARY KEY,
    current_crdt_frontier json NOT NULL,
    handle text NOT NULL UNIQUE,
    publish_status text, -- NotePublishStatus
    published_at text DEFAULT (datetime('now')),
    created_at text DEFAULT (datetime('now')),
    updated_at text DEFAULT (datetime('now')),
    display_in_profile_id text NOT NULL, -- @TODO looking for a better name for this column
    FOREIGN KEY (id) REFERENCES resource_crdts (id) ON DELETE CASCADE,
    FOREIGN KEY (display_in_profile_id) REFERENCES people (id) ON DELETE CASCADE
);

CREATE INDEX idx_notes_handle ON notes (handle);

CREATE TABLE note_translations (
    note_id integer NOT NULL,
    locale text NOT NULL, -- SupportedLocale
    content json NOT NULL, -- Tiptap Rich Text
    content_plain_text text NOT NULL,
    translated_at_crdt_frontier json NOT NULL,
    translation_source text NOT NULL, -- Original, Automatic, Manual
    original_locale text NOT NULL, -- SupportedLocale
    PRIMARY KEY (note_id, locale),
    FOREIGN KEY (note_id) REFERENCES notes (id) ON DELETE CASCADE
) WITHOUT ROWID;

CREATE TABLE note_tags (
    note_id text NOT NULL,
    tag_id text NOT NULL,
    PRIMARY KEY (note_id, tag_id),
    FOREIGN KEY (note_id) REFERENCES notes (id) ON DELETE CASCADE,
    FOREIGN KEY (tag_id) REFERENCES tags (id) ON DELETE CASCADE
) WITHOUT ROWID;

CREATE TABLE note_vegetables (
    note_id text NOT NULL,
    vegetable_id text NOT NULL,
    PRIMARY KEY (note_id, vegetable_id),
    FOREIGN KEY (note_id) REFERENCES notes (id) ON DELETE CASCADE,
    FOREIGN KEY (vegetable_id) REFERENCES vegetables (id) ON DELETE CASCADE
) WITHOUT ROWID;

-- =========
-- RESOURCES
-- =========
-- The source of truth of all resource data
CREATE TABLE resource_crdts (
    id text PRIMARY KEY,
    loro_crdt blob NOT NULL,
    created_at text DEFAULT (datetime('now')),
    updated_at text DEFAULT (datetime('now'))
) WITHOUT ROWID;

-- People's edit suggestions that compose the library
CREATE TABLE resource_revisions (
    id text PRIMARY KEY,
    resource_crdt_id text,
    created_by_id text,
    from_crdt_frontier json NOT NULL,
    diff json NOT NULL,
    approval_status text NOT NULL, -- ApprovalStatus
    created_at text DEFAULT (datetime('now')),
    updated_at text DEFAULT (datetime('now')),
    FOREIGN KEY (resource_crdt_id) REFERENCES resource_crdts (id) ON DELETE CASCADE,
    FOREIGN KEY (created_by_id) REFERENCES people (id) ON DELETE SET NULL
);

-- The core queryable data, materialized from the CRDT
CREATE TABLE resources (
    id text PRIMARY KEY,
    current_crdt_frontier json NOT NULL,
    handle text NOT NULL UNIQUE,
    url text NOT NULL UNIQUE,
    format text NOT NULL, -- ResourceFormat
    thumbnail_id text,
    created_at text DEFAULT (datetime('now')),
    updated_at text DEFAULT (datetime('now')),
    FOREIGN KEY (id) REFERENCES resource_crdts (id) ON DELETE CASCADE,
    FOREIGN KEY (thumbnail_id) REFERENCES images (id) ON DELETE SET NULL
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
    FOREIGN KEY (resource_id) REFERENCES resources (id) ON DELETE CASCADE
) WITHOUT ROWID;

CREATE TABLE resource_tags (
    resource_id text NOT NULL,
    tag_id text NOT NULL,
    PRIMARY KEY (resource_id, tag_id),
    FOREIGN KEY (resource_id) REFERENCES resources (id) ON DELETE CASCADE,
    FOREIGN KEY (tag_id) REFERENCES tags (id) ON DELETE CASCADE
) WITHOUT ROWID;

CREATE TABLE resource_vegetables (
    resource_id text NOT NULL,
    vegetable_id text NOT NULL,
    order_index integer,
    PRIMARY KEY (resource_id, vegetable_id),
    FOREIGN KEY (resource_id) REFERENCES resources (id) ON DELETE CASCADE,
    FOREIGN KEY (vegetable_id) REFERENCES vegetables (id) ON DELETE CASCADE
) WITHOUT ROWID;

-- =========
-- EVENTS
-- =========
-- The source of truth of all event data
CREATE TABLE event_crdts (
    id text PRIMARY KEY,
    loro_crdt blob NOT NULL,
    created_at text DEFAULT (datetime('now')),
    updated_at text DEFAULT (datetime('now'))
) WITHOUT ROWID;

-- How notes are modified after being published
CREATE TABLE event_revisions (
    id text PRIMARY KEY,
    event_crdt_id text,
    created_by_id text,
    from_crdt_frontier json NOT NULL,
    diff json NOT NULL,
    approval_status text NOT NULL, -- ApprovalStatus
    created_at text DEFAULT (datetime('now')),
    updated_at text DEFAULT (datetime('now')),
    FOREIGN KEY (event_crdt_id) REFERENCES event_crdts (id) ON DELETE CASCADE,
    FOREIGN KEY (created_by_id) REFERENCES people (id) ON DELETE SET NULL
);

-- The core queryable data, materialized from the CRDT
CREATE TABLE events (
    id text PRIMARY KEY,
    current_crdt_frontier json NOT NULL,
    handle text NOT NULL UNIQUE,
    date date NOT NULL,
    presence_type text NOT NULL, -- either in-person or virtual @todo find a better name for the column
    -- @TODO need to finish event schema
    created_at text DEFAULT (datetime('now')),
    updated_at text DEFAULT (datetime('now')),
    FOREIGN KEY (id) REFERENCES event_crdts (id) ON DELETE CASCADE,
    FOREIGN KEY (thumbnail_id) REFERENCES images (id) ON DELETE SET NULL
);

CREATE INDEX idx_events_handle ON events (handle);

-- Per-locale data, materialized from the CRDT
CREATE TABLE event_translations (
    event_id text NOT NULL,
    locale text NOT NULL, -- SupportedLocale
    title text NOT NULL,
    description json, -- Tiptap Rich Text
    translated_at_crdt_frontier json NOT NULL,
    translation_source text NOT NULL, -- Original, Automatic, Manual
    original_locale text NOT NULL, -- SupportedLocale
    PRIMARY KEY (event_id, locale),
    FOREIGN KEY (event_id) REFERENCES events (id) ON DELETE CASCADE
) WITHOUT ROWID;

CREATE TABLE event_tags (
    event_id text NOT NULL,
    tag_id text NOT NULL,
    PRIMARY KEY (event_id, tag_id),
    FOREIGN KEY (event_id) REFERENCES events (id) ON DELETE CASCADE,
    FOREIGN KEY (tag_id) REFERENCES tags (id) ON DELETE CASCADE
) WITHOUT ROWID;

-- =========
-- BOOKMARKS
-- =========
CREATE TABLE person_vegetable_bookmarks ( -- @TODO better name for these bookmark tables?
    person_id text NOT NULL,
    vegetable_id text NOT NULL,
    status text NOT NULL, -- BookmarkStatus
    PRIMARY KEY (person_id, vegetable_id),
    FOREIGN KEY (person_id) REFERENCES people (id) ON DELETE CASCADE,
    FOREIGN KEY (vegetable_id) REFERENCES vegetables (id) ON DELETE CASCADE
) WITHOUT ROWID;

CREATE TABLE person_resource_bookmarks (
    person_id text NOT NULL,
    resource_id text NOT NULL,
    status text NOT NULL, -- BookmarkStatus
    PRIMARY KEY (person_id, resource_id),
    FOREIGN KEY (person_id) REFERENCES people (id) ON DELETE CASCADE,
    FOREIGN KEY (resource_id) REFERENCES resources (id) ON DELETE CASCADE
) WITHOUT ROWID;
