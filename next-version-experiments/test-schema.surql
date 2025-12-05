-- =========================
-- USER & PROFILE
-- =========================

DEFINE TABLE user SCHEMAFULL
  PERMISSIONS
    FOR select, update, delete WHERE id = $auth.id,
    FOR create WHERE true;

DEFINE FIELD email         ON user TYPE string;
DEFINE FIELD role          ON user TYPE string ASSERT $value IN ['ADMIN', 'MODERATOR', 'USER'];

DEFINE INDEX idx_user_email ON user COLUMNS email UNIQUE;

DEFINE TABLE profile SCHEMAFULL
  PERMISSIONS
    FOR select, update, delete WHERE id = $auth.id OR $auth.role = 'ADMIN',
    FOR create WHERE true;

DEFINE FIELD user_id       ON profile TYPE record<user>;
DEFINE FIELD handle        ON profile TYPE string;
DEFINE FIELD name          ON profile TYPE string;
DEFINE FIELD bio           ON profile TYPE string;
DEFINE FIELD avatar_url    ON profile TYPE string;
DEFINE FIELD location      ON profile TYPE object;         -- use SurrealDB's object or custom geo type
DEFINE FIELD type          ON profile TYPE string ASSERT $value IN ['Person', 'Organization'];
DEFINE FIELD role          ON profile TYPE string ASSERT $value IN ['User', 'Guardian', 'Admin'];
DEFINE FIELD created_at    ON profile TYPE datetime;

DEFINE INDEX idx_profile_handle ON profile COLUMNS handle UNIQUE;

-- =========================
-- NOTES (SOCIAL CONTENT)
-- =========================

DEFINE TABLE note SCHEMAFULL;

DEFINE FIELD handle            ON note TYPE string;
DEFINE FIELD created_at        ON note TYPE datetime;
DEFINE FIELD content_json      ON note TYPE object;    -- Tiptap JSON
DEFINE FIELD content_text      ON note TYPE string;    -- For FTS
DEFINE FIELD translations      ON note TYPE object;    -- {pt, es}
DEFINE FIELD original_language ON note TYPE string ASSERT $value IN ['pt', 'es'];
DEFINE FIELD types             ON note TYPE array;     -- List of enums: 'EXPERIMENT', 'QUESTION', etc.
DEFINE FIELD publish_status    ON note TYPE string ASSERT $value IN ['PUBLIC', 'PRIVATE', 'COMMUNITY'];
DEFINE FIELD note_index        ON note TYPE int;       -- For deterministic random feed

DEFINE INDEX idx_note_handle  ON note COLUMNS handle UNIQUE;

-- =========================
-- ENCYCLOPEDIA (VEGETABLE & VARIETY)
-- =========================

DEFINE TABLE vegetable SCHEMAFULL;

DEFINE FIELD handle           ON vegetable TYPE string;
DEFINE FIELD scientific_names ON vegetable TYPE array;
DEFINE FIELD stratum          ON vegetable TYPE string;      -- "Emergent", "High", etc.
DEFINE FIELD strata           ON vegetable TYPE array;
DEFINE FIELD lifecycles       ON vegetable TYPE array;
DEFINE FIELD uses             ON vegetable TYPE array;
DEFINE FIELD edible_parts     ON vegetable TYPE array;
DEFINE FIELD planting_methods ON vegetable TYPE array;
DEFINE FIELD height_cm        ON vegetable TYPE object;      -- { min: float, max: float }
DEFINE FIELD temp_celsius     ON vegetable TYPE object;      -- { min: float, max: float }
DEFINE FIELD cycle_days       ON vegetable TYPE object;      -- { min: int, max: int }
DEFINE FIELD photos           ON vegetable TYPE array;
DEFINE FIELD common_names     ON vegetable TYPE object;      -- { pt: [...], es: [...] }
DEFINE FIELD description      ON vegetable TYPE object;      -- { pt: {json, text}, es: {json, text} }
DEFINE FIELD origin           ON vegetable TYPE object;      -- { pt: string, es: string }
DEFINE FIELD gender           ON vegetable TYPE object;      -- { pt: ..., es: ... }

DEFINE INDEX idx_veg_handle  ON vegetable COLUMNS handle UNIQUE;

DEFINE TABLE variety SCHEMAFULL;

DEFINE FIELD handle           ON variety TYPE string;
DEFINE FIELD scientific_names ON variety TYPE array;
DEFINE FIELD common_names     ON variety TYPE object;       -- { pt: [...], es: [...] }
DEFINE FIELD description      ON variety TYPE object;       -- { pt: {json, text}, es: {json, text} }
DEFINE FIELD stratum          ON variety TYPE string;
DEFINE FIELD strata           ON variety TYPE array;
DEFINE FIELD lifecycles       ON variety TYPE array;
DEFINE FIELD uses             ON variety TYPE array;
DEFINE FIELD edible_parts     ON variety TYPE array;
DEFINE FIELD planting_methods ON variety TYPE array;
DEFINE FIELD height_cm        ON variety TYPE object;
DEFINE FIELD temp_celsius     ON variety TYPE object;
DEFINE FIELD cycle_days       ON variety TYPE object;
DEFINE FIELD photos           ON variety TYPE array;

DEFINE INDEX idx_var_handle  ON variety COLUMNS handle UNIQUE;

-- =========================
-- WIKI GOVERNANCE: EDIT PROPOSALS
-- =========================

DEFINE TABLE edit_proposal SCHEMAFULL;

DEFINE FIELD target_id      ON edit_proposal TYPE record;      -- vegetable/variety
DEFINE FIELD author_id      ON edit_proposal TYPE record<profile>;
DEFINE FIELD operation      ON edit_proposal TYPE string;      -- 'ADD_NAME', 'UPDATE_DESC', etc.
DEFINE FIELD payload        ON edit_proposal TYPE object;
DEFINE FIELD status         ON edit_proposal TYPE string ASSERT $value IN ['PENDING', 'APPLIED', 'REJECTED'];
DEFINE FIELD reject_reason  ON edit_proposal TYPE string;
DEFINE FIELD created_at     ON edit_proposal TYPE datetime;

-- =========================
-- LIBRARY RESOURCES
-- =========================

DEFINE TABLE resource SCHEMAFULL;

DEFINE FIELD handle             ON resource TYPE string;
DEFINE FIELD url                ON resource TYPE string;
DEFINE FIELD format             ON resource TYPE string;    -- 'VIDEO', 'BOOK', etc.
DEFINE FIELD title              ON resource TYPE object;    -- { pt: string, es: string }
DEFINE FIELD description        ON resource TYPE object;    -- { pt: {json, text}, es: {json, text} }
DEFINE FIELD original_language  ON resource TYPE string;

DEFINE INDEX idx_resource_handle ON resource COLUMNS handle UNIQUE;

-- =========================
-- RELATIONSHIPS (EDGES) as GRAPH TABLES
-- =========================

-- Authorship Edges
DEFINE TABLE published TYPE RELATION
  FROM profile
  TO note;

DEFINE TABLE proposed TYPE RELATION
  FROM profile
  TO edit_proposal;

-- Hierarchy: Vegetable→Variety
DEFINE TABLE has_variety TYPE RELATION
  FROM vegetable
  TO variety;

-- Ecological Consortiums (Veg↔Veg)
DEFINE TABLE consortium_with TYPE RELATION
  FROM vegetable
  TO vegetable;

-- Polymorphic 'mentions' edge
DEFINE TABLE mentions TYPE RELATION
  FROM note
  TO vegetable | variety | profile | resource | note; -- Polymorphic targets

-- Resource↔Vegetable linking
DEFINE TABLE related_to TYPE RELATION
  FROM resource
  TO vegetable;

-- =========================
-- ADDITIONAL INDEXING/UTILITIES
-- =========================

-- For random feed, get note count:
-- SELECT count() FROM note;

-- To get notes in random order (client generates array of note_index, fetches by index)

-- =========================
-- PERMISSIONS (EXAMPLES)
-- =========================

-- Example: limit edit_proposal creation to logged-in users
-- (Add to DEFINE TABLE edit_proposal ...)
-- PERMISSIONS
--   FOR select, update, delete WHERE author_id = $auth.profile_id OR $auth.role = 'ADMIN',
--   FOR create WHERE $auth != NONE;

-- =========================
-- NOTES
-- =========================

-- All handles are indexed as UNIQUE per-table for URL routing.
-- Edges (TYPE RELATION) support metadata (add fields as needed).
-- The mentions edge is polymorphic: FROM note TO multiple entity types.

-- For multilingual fields, always use object/json format: { pt: ..., es: ... }
-- For FTS, SurrealDB supports SEARCH ANALYZER "fulltext" for Latin characters.

-- You can further customize schema validation, constraints, and triggers/events as needed.
