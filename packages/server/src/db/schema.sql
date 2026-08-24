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
  account_id text NOT NULL REFERENCES accounts (id) ON DELETE CASCADE
);

CREATE TABLE oauth_accounts (
  id text NOT NULL PRIMARY KEY,
  oauth_account_id text NOT NULL,
  provider_id text NOT NULL,
  account_id text NOT NULL REFERENCES accounts (id) ON DELETE CASCADE,
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

CREATE INDEX session_account_id_idx ON sessions (account_id);

CREATE INDEX account_account_id_idx ON oauth_accounts (account_id);

CREATE INDEX verification_identifier_idx ON verifications (identifier);

-- ========
-- PROFILES
-- ========
CREATE TABLE profiles (
  id text NOT NULL PRIMARY KEY,
  type text NOT NULL, -- ProfileType
  handle text NOT NULL UNIQUE,
  name text NOT NULL,
  bio json,
  location text,
  photo_id text,
  visibility text NOT NULL,
  created_at text NOT NULL,
  updated_at text NOT NULL,
  FOREIGN KEY (photo_id) REFERENCES images (id) ON DELETE SET NULL
);

CREATE INDEX idx_profiles_handle ON profiles (handle);

CREATE TABLE people (
  id text PRIMARY KEY,
  access_level text NOT NULL,
  access_set_by_id text,
  access_set_at text,
  FOREIGN KEY (id) REFERENCES profiles (id) ON DELETE CASCADE,
  FOREIGN KEY (id) REFERENCES accounts (id) ON DELETE CASCADE,
  FOREIGN KEY (access_set_by_id) REFERENCES profiles (id) ON DELETE SET NULL
);

CREATE TABLE organizations (
  id text PRIMARY KEY,
  type text NOT NULL,
  members_visibility text NOT NULL,
  FOREIGN KEY (id) REFERENCES profiles (id) ON DELETE CASCADE
);

-- ========================
-- ORGANIZATION MEMBERSHIPS
-- ========================
CREATE TABLE organization_memberships (
  person_id text NOT NULL,
  organization_id text NOT NULL,
  access_level text NOT NULL,
  created_at text NOT NULL,
  updated_at text NOT NULL,
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
  access_level text NOT NULL,
  status text NOT NULL,
  created_by_id text NOT NULL,
  created_at text NOT NULL,
  updated_at text NOT NULL,
  UNIQUE (organization_id, email),
  FOREIGN KEY (organization_id) REFERENCES organizations (id) ON DELETE CASCADE,
  FOREIGN KEY (created_by_id) REFERENCES people (id) ON DELETE CASCADE
);

-- ====
-- TAGS
-- ====
CREATE TABLE tags (
  id text PRIMARY KEY,
  handle text NOT NULL UNIQUE,
  names json NOT NULL,
  description json,
  cluster text,
  created_at text NOT NULL,
  updated_at text NOT NULL,
  created_by_id text
);

CREATE INDEX idx_tags_handle ON tags (handle);

-- Suggested tags (moderation queue, independent of publications)
CREATE TABLE suggested_tags (
  id text PRIMARY KEY,
  handle text NOT NULL UNIQUE,
  names json NOT NULL,
  status text NOT NULL, -- SuggestedTagStatus
  approved_tag_id text,
  created_at text NOT NULL,
  updated_at text NOT NULL,
  FOREIGN KEY (approved_tag_id) REFERENCES tags (id) ON DELETE SET NULL
);

-- Link suggested tags back to source publications.
CREATE TABLE suggested_tag_sources (
  suggested_tag_id text NOT NULL,
  publication_id text NOT NULL,
  PRIMARY KEY (suggested_tag_id, publication_id),
  FOREIGN KEY (suggested_tag_id) REFERENCES suggested_tags (id) ON DELETE CASCADE,
  FOREIGN KEY (publication_id) REFERENCES publication_crdts (id) ON DELETE CASCADE
) WITHOUT ROWID;

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
  created_at text NOT NULL,
  updated_at text NOT NULL,
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

-- =============
-- WIKI ARTICLES
-- =============
--
-- The source of truth of contributor-editable article data.
CREATE TABLE wiki_article_crdts (
  id text PRIMARY KEY,
  status text NOT NULL, -- WikiArticleStatus
  crdt_snapshot blob NOT NULL, -- LoroSnapshot
  created_at text NOT NULL,
  updated_at text NOT NULL
) WITHOUT ROWID;

-- Submitted edits. Approved rows are also the article's revision history.
CREATE TABLE wiki_article_revisions (
  id text PRIMARY KEY,
  wiki_article_id text NOT NULL,
  created_by_id text,
  crdt_update blob NOT NULL, -- LoroDocUpdate
  from_crdt_frontier json NOT NULL, -- LoroDocFrontier
  evaluation text NOT NULL, -- RevisionEvaluation
  evaluation_reason text,
  evaluated_by_id text,
  evaluated_at text,
  created_at text NOT NULL,
  updated_at text NOT NULL,
  FOREIGN KEY (wiki_article_id) REFERENCES wiki_article_crdts (id) ON DELETE CASCADE,
  FOREIGN KEY (created_by_id) REFERENCES people (id) ON DELETE SET NULL,
  FOREIGN KEY (evaluated_by_id) REFERENCES people (id) ON DELETE SET NULL
);

CREATE INDEX idx_wiki_article_revisions_article_evaluation ON wiki_article_revisions (wiki_article_id, evaluation);

-- The core queryable data, materialized from the CRDT.
CREATE TABLE wiki_articles (
  id text PRIMARY KEY,
  kind text NOT NULL, -- WikiArticleKind
  status text NOT NULL, -- WikiArticleStatus
  attributes json NOT NULL,
  current_crdt_frontier json NOT NULL,
  created_at text NOT NULL,
  updated_at text NOT NULL,
  FOREIGN KEY (id) REFERENCES wiki_article_crdts (id) ON DELETE CASCADE
);

CREATE INDEX idx_wiki_articles_kind_status ON wiki_articles (kind, status);

-- Per-locale contributor-editable data, materialized from the CRDT.
CREATE TABLE wiki_article_translations (
  wiki_article_id text NOT NULL,
  locale text NOT NULL,
  common_names json NOT NULL,
  searchable_names text NOT NULL,
  content json, -- TiptapDocument
  content_plain_text text NOT NULL,
  grammatical_gender text, -- GrammaticalGender
  PRIMARY KEY (wiki_article_id, locale),
  FOREIGN KEY (wiki_article_id) REFERENCES wiki_article_crdts (id) ON DELETE CASCADE
) WITHOUT ROWID;

-- Owns a route handle across all locales. `locales` records which translations
-- use it while uniqueness remains scoped only to the article kind.
CREATE TABLE wiki_article_handles (
  wiki_article_id text NOT NULL,
  kind text NOT NULL, -- WikiArticleKind
  handle text NOT NULL,
  locale text NOT NULL, -- Locale
  PRIMARY KEY (wiki_article_id, kind, handle),
  UNIQUE (kind, handle),
  FOREIGN KEY (wiki_article_id) REFERENCES wiki_article_crdts (id) ON DELETE CASCADE
) WITHOUT ROWID;


-- ================
-- WIKI ARTICLE PHOTOS
-- ================
CREATE TABLE wiki_article_photos (
  wiki_article_id text NOT NULL,
  image_id text NOT NULL,
  order_index integer,
  PRIMARY KEY (wiki_article_id, image_id),
  FOREIGN KEY (wiki_article_id) REFERENCES wiki_article_crdts (id) ON DELETE CASCADE,
  FOREIGN KEY (image_id) REFERENCES images (id) ON DELETE CASCADE
) WITHOUT ROWID;

CREATE TABLE wiki_article_photo_metadata (
  id text PRIMARY KEY,
  category text NOT NULL,
  description json,
  moderation_status text,
  created_at text NOT NULL,
  updated_at text NOT NULL,
  FOREIGN KEY (id) REFERENCES images (id) ON DELETE CASCADE
);

 -- =========
-- RESOURCES
-- =========
--
-- The source of truth of all resource data
CREATE TABLE resource_crdts (
  id text PRIMARY KEY,
  crdt_snapshot blob NOT NULL, -- LoroSnapshot
  created_at text NOT NULL,
  updated_at text
) WITHOUT ROWID;

-- People's edit suggestions that compose the library
CREATE TABLE resource_revisions (
  id text PRIMARY KEY,
  resource_id text,
  created_by_id text,
  crdt_update blob NOT NULL,
  from_crdt_frontier json NOT NULL,
  evaluation text NOT NULL,
  evaluated_by_id text,
  evaluated_at text,
  created_at text NOT NULL,
  updated_at text NOT NULL,
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
  url_state text NOT NULL,
  last_checked_at text,
  format text NOT NULL,
  thumbnail_image_id text,
  created_at text NOT NULL,
  updated_at text NOT NULL,
  FOREIGN KEY (id) REFERENCES resource_crdts (id) ON DELETE CASCADE,
  FOREIGN KEY (thumbnail_image_id) REFERENCES images (id) ON DELETE SET NULL
);

CREATE INDEX idx_resources_handle ON resources (handle);

-- Per-locale data, materialized from the CRDT
CREATE TABLE resource_translations (
  resource_id text NOT NULL,
  locale text NOT NULL,
  title text NOT NULL,
  description json,
  credit_line text,
  translated_at_crdt_frontier json NOT NULL,
  translation_source text NOT NULL,
  original_locale text NOT NULL,
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

-- =====
-- PUBLICATIONS
-- =====
--
-- The source of truth of all publication data
CREATE TABLE publication_crdts (
  id text PRIMARY KEY,
  crdt_snapshot blob NOT NULL, -- LoroSnapshot
  classification json,
  owner_profile_id text NOT NULL,
  created_at text NOT NULL,
  updated_at text NOT NULL,
  FOREIGN KEY (owner_profile_id) REFERENCES profiles (id) ON DELETE CASCADE
) WITHOUT ROWID;

-- How publications are modified
CREATE TABLE publication_commits (
  id text PRIMARY KEY,
  publication_id text NOT NULL,
  created_by_id text,
  from_crdt_frontier json NOT NULL,
  crdt_update blob NOT NULL,
  updated_at text NOT NULL,
  created_at text NOT NULL,
  FOREIGN KEY (publication_id) REFERENCES publication_crdts (id) ON DELETE CASCADE,
  FOREIGN KEY (created_by_id) REFERENCES people (id) ON DELETE SET NULL
);

-- The core queryable data, materialized from the CRDT
CREATE TABLE publications (
  id text PRIMARY KEY,
  current_crdt_frontier json NOT NULL,
  handle text NOT NULL UNIQUE,
  visibility text,
  published_at text,
  created_at text NOT NULL,
  updated_at text NOT NULL,
  owner_profile_id text NOT NULL,
  kind text NOT NULL,
  start_date text,
  end_date text,
  location_or_url text,
  attendance_mode text,
  FOREIGN KEY (id) REFERENCES publication_crdts (id) ON DELETE CASCADE,
  FOREIGN KEY (owner_profile_id) REFERENCES profiles (id) ON DELETE CASCADE
);

CREATE INDEX idx_publications_handle ON publications (handle);

CREATE INDEX idx_publications_kind ON publications (kind);

CREATE TABLE publication_translations (
  publication_id text NOT NULL,
  locale text NOT NULL,
  content json NOT NULL,
  content_plain_text text NOT NULL,
  translated_at_crdt_frontier json NOT NULL,
  translation_source text NOT NULL,
  original_locale text NOT NULL,
  PRIMARY KEY (publication_id, locale),
  FOREIGN KEY (publication_id) REFERENCES publication_crdts (id) ON DELETE CASCADE
) WITHOUT ROWID;

CREATE TABLE publication_tags (
  publication_id text NOT NULL,
  tag_id text NOT NULL,
  extraction_text text,
  PRIMARY KEY (publication_id, tag_id),
  FOREIGN KEY (publication_id) REFERENCES publication_crdts (id) ON DELETE CASCADE,
  FOREIGN KEY (tag_id) REFERENCES tags (id) ON DELETE CASCADE
) WITHOUT ROWID;

CREATE TABLE publication_wiki_articles (
  publication_id text NOT NULL,
  wiki_article_id text NOT NULL,
  extraction_text text,
  PRIMARY KEY (publication_id, wiki_article_id),
  FOREIGN KEY (publication_id) REFERENCES publication_crdts (id) ON DELETE CASCADE,
  FOREIGN KEY (wiki_article_id) REFERENCES wiki_article_crdts (id) ON DELETE CASCADE
) WITHOUT ROWID;

-- ========
-- COMMENTS
-- ========
--
-- The source of truth of all comment data
CREATE TABLE comment_crdts (
  id text PRIMARY KEY,
  publication_id text,
  resource_id text,
  parent_comment_id text,
  crdt_snapshot blob NOT NULL, -- LoroSnapshot
  owner_profile_id text NOT NULL,
  moderation_status text,
  created_at text NOT NULL,
  updated_at text NOT NULL,
  FOREIGN KEY (publication_id) REFERENCES publication_crdts (id) ON DELETE CASCADE,
  FOREIGN KEY (resource_id) REFERENCES resource_crdts (id) ON DELETE CASCADE,
  FOREIGN KEY (parent_comment_id) REFERENCES comment_crdts (id) ON DELETE CASCADE,
  FOREIGN KEY (owner_profile_id) REFERENCES profiles (id) ON DELETE CASCADE,
  CONSTRAINT check_comment_parent CHECK (
    (publication_id IS NOT NULL) + (resource_id IS NOT NULL) = 1
  )
);

-- How comments are modified
CREATE TABLE comment_commits (
  id text PRIMARY KEY,
  comment_id text,
  created_by_id text,
  from_crdt_frontier json NOT NULL,
  crdt_update blob NOT NULL,
  created_at text NOT NULL,
  FOREIGN KEY (comment_id) REFERENCES comment_crdts (id) ON DELETE CASCADE,
  FOREIGN KEY (created_by_id) REFERENCES people (id) ON DELETE SET NULL
);

-- The core queryable data, materialized from the CRDT
CREATE TABLE comments (
  id text PRIMARY KEY,
  publication_id text,
  resource_id text,
  parent_comment_id text,
  current_crdt_frontier json NOT NULL,
  moderation_status text,
  created_at text NOT NULL,
  updated_at text NOT NULL,
  owner_profile_id text NOT NULL,
  FOREIGN KEY (id) REFERENCES comment_crdts (id) ON DELETE CASCADE,
  FOREIGN KEY (owner_profile_id) REFERENCES profiles (id) ON DELETE CASCADE,
  FOREIGN KEY (publication_id) REFERENCES publication_crdts (id) ON DELETE CASCADE,
  FOREIGN KEY (resource_id) REFERENCES resource_crdts (id) ON DELETE CASCADE,
  CONSTRAINT check_comment_parent CHECK (
    (publication_id IS NOT NULL) + (resource_id IS NOT NULL) = 1
  )
);

CREATE TABLE comment_translations (
  comment_id text NOT NULL,
  locale text NOT NULL,
  content json NOT NULL,
  content_plain_text text NOT NULL,
  translated_at_crdt_frontier json NOT NULL,
  translation_source text NOT NULL,
  original_locale text NOT NULL,
  PRIMARY KEY (comment_id, locale),
  FOREIGN KEY (comment_id) REFERENCES comment_crdts (id) ON DELETE CASCADE
) WITHOUT ROWID;

-- =========
-- BOOKMARKS
-- =========
CREATE TABLE bookmarks_wiki_articles (
  person_id text NOT NULL,
  wiki_article_id text NOT NULL,
  state text NOT NULL,
  PRIMARY KEY (person_id, wiki_article_id),
  FOREIGN KEY (person_id) REFERENCES people (id) ON DELETE CASCADE,
  FOREIGN KEY (wiki_article_id) REFERENCES wiki_article_crdts (id) ON DELETE CASCADE
) WITHOUT ROWID;

CREATE TABLE bookmarks_resources (
  person_id text NOT NULL,
  resource_id text NOT NULL,
  state text NOT NULL,
  PRIMARY KEY (person_id, resource_id),
  FOREIGN KEY (person_id) REFERENCES people (id) ON DELETE CASCADE,
  FOREIGN KEY (resource_id) REFERENCES resource_crdts (id) ON DELETE CASCADE
) WITHOUT ROWID;
