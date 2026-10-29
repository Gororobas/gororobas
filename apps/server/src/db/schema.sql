-- ========
-- AUTENTICATION
-- application accounts and Yielded durable storage.
-- ========
CREATE TABLE auth_subjects (
  id text NOT NULL PRIMARY KEY,
  email text NOT NULL UNIQUE,
  is_email_verified integer NOT NULL,
  active integer NOT NULL DEFAULT 1,
  security_revision text NOT NULL,
  -- NULL while an email sign-up awaits its first code
  claimed_at text,
  created_at text NOT NULL,
  updated_at text NOT NULL
);

CREATE INDEX auth_subjects_unclaimed_idx ON auth_subjects (created_at)
WHERE
  claimed_at IS NULL;

CREATE TABLE auth_identifiers (
  namespace text NOT NULL,
  value text NOT NULL,
  module_id text,
  credential_id text,
  auth_subject_id text NOT NULL REFERENCES auth_subjects (id) ON DELETE CASCADE,
  revision text NOT NULL,
  verified_at integer,
  active integer NOT NULL,
  UNIQUE (namespace, value)
);

CREATE TABLE auth_credentials (
  credential_id text NOT NULL,
  auth_subject_id text NOT NULL REFERENCES auth_subjects (id) ON DELETE CASCADE,
  revision text NOT NULL,
  active integer NOT NULL,
  UNIQUE (credential_id)
);

CREATE INDEX auth_credentials_auth_subject_id_idx ON auth_credentials (auth_subject_id);

CREATE TABLE auth_sessions (
  session_id text NOT NULL,
  auth_subject_id text NOT NULL REFERENCES auth_subjects (id) ON DELETE CASCADE,
  digest text NOT NULL,
  security_revision text NOT NULL,
  issued_at integer NOT NULL,
  expires_at integer NOT NULL,
  absolute_expires_at integer NOT NULL,
  record text NOT NULL,
  UNIQUE (session_id),
  UNIQUE (digest)
);

CREATE INDEX auth_sessions_auth_subject_id_idx ON auth_sessions (auth_subject_id);

CREATE TABLE auth_pending (
  module_id text NOT NULL,
  kind text NOT NULL,
  digest text NOT NULL,
  version text NOT NULL,
  flow_id text NOT NULL,
  auth_subject_id text NOT NULL REFERENCES auth_subjects (id) ON DELETE CASCADE,
  binding_digest text NOT NULL,
  snapshot text NOT NULL,
  expires_at integer NOT NULL,
  attempt_limit integer NOT NULL,
  failed_attempts integer NOT NULL,
  consumed integer NOT NULL,
  UNIQUE (digest)
);

CREATE TABLE auth_email_credentials (
  module_id text NOT NULL,
  auth_subject_id text NOT NULL REFERENCES auth_subjects (id) ON DELETE CASCADE,
  credential_id text NOT NULL,
  identifier_namespace text NOT NULL,
  identifier_value text NOT NULL,
  credential_revision text NOT NULL,
  active integer NOT NULL,
  UNIQUE (module_id, credential_id),
  UNIQUE (module_id, identifier_namespace, identifier_value)
);

CREATE TABLE auth_proofs (
  module_id text NOT NULL,
  purpose text NOT NULL,
  series_key text NOT NULL,
  proof_id text NOT NULL,
  binding text NOT NULL,
  verifier_key_id text NOT NULL,
  verifier_digest text NOT NULL,
  issued_at integer NOT NULL,
  expires_at integer NOT NULL,
  failed_attempts integer NOT NULL,
  UNIQUE (module_id, purpose, series_key),
  UNIQUE (module_id, proof_id)
);

-- ========
-- PROFILES
-- ========
--
CREATE TABLE profiles (
  id text NOT NULL PRIMARY KEY,
  type text NOT NULL, -- ProfileType
  handle text NOT NULL UNIQUE,
  name text NOT NULL,
  bio json,
  location text,
  photo_id text,
  visibility text NOT NULL, -- ProfileVisibility
  -- Name, handle and location folded for full-text search (indexed at the end of this file)
  searchable_text text NOT NULL,
  created_at text NOT NULL,
  updated_at text NOT NULL,
  FOREIGN KEY (photo_id) REFERENCES media_assets (id) ON DELETE SET NULL
);

CREATE INDEX idx_profiles_handle ON profiles (handle);

CREATE TABLE people (
  id text PRIMARY KEY,
  access_level text NOT NULL, -- PlatformAccessLevel
  access_set_by_id text,
  access_set_at text,
  FOREIGN KEY (id) REFERENCES profiles (id) ON DELETE CASCADE,
  FOREIGN KEY (id) REFERENCES auth_subjects (id) ON DELETE CASCADE,
  FOREIGN KEY (access_set_by_id) REFERENCES profiles (id) ON DELETE SET NULL
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
--
CREATE TABLE organization_memberships (
  person_id text NOT NULL,
  organization_id text NOT NULL,
  access_level text NOT NULL, -- OrganizationAccessLevel
  created_at text NOT NULL,
  updated_at text NOT NULL,
  PRIMARY KEY (person_id, organization_id),
  FOREIGN KEY (person_id) REFERENCES people (id) ON DELETE CASCADE,
  FOREIGN KEY (organization_id) REFERENCES organizations (id) ON DELETE CASCADE
);

CREATE TABLE organization_invitations (
  id text NOT NULL PRIMARY KEY,
  organization_id text NOT NULL,
  email text NOT NULL,
  access_level text NOT NULL, -- OrganizationAccessLevel
  status text NOT NULL, -- OrganizationInvitationStatus
  created_by_id text NOT NULL,
  created_at text NOT NULL,
  updated_at text NOT NULL,
  UNIQUE (organization_id, email),
  FOREIGN KEY (organization_id) REFERENCES organizations (id) ON DELETE CASCADE,
  FOREIGN KEY (created_by_id) REFERENCES people (id) ON DELETE CASCADE
);

-- ======
-- MEDIA ASSETS
-- ======
--
CREATE TABLE media_assets (
  id text PRIMARY KEY,
  format text NOT NULL, -- MediaAssetFormat
  content_type text,
  byte_size integer,
  category text,
  descriptions json, -- { [language]: TiptapDocument }
  metadata json NOT NULL,
  moderation_status text NOT NULL, -- ModerationStatus
  created_at text NOT NULL,
  updated_at text NOT NULL,
  owner_profile_id text NOT NULL,
  FOREIGN KEY (owner_profile_id) REFERENCES profiles (id) ON DELETE CASCADE
);

CREATE TABLE media_asset_credits (
  media_asset_id text NOT NULL,
  order_index integer NOT NULL,
  credit_line text,
  credit_url text,
  person_id text,
  PRIMARY KEY (media_asset_id, order_index),
  FOREIGN KEY (media_asset_id) REFERENCES media_assets (id) ON DELETE CASCADE,
  FOREIGN KEY (person_id) REFERENCES people (id) ON DELETE CASCADE
);

-- =============
-- WIKI ARTICLES
-- =============
--
-- The source of truth of contributor-editable article data.
CREATE TABLE wiki_article_sources (
  id text NOT NULL PRIMARY KEY,
  status text NOT NULL, -- WikiArticleStatus
  crdt_snapshot blob NOT NULL, -- LoroSnapshot
  created_at text NOT NULL,
  updated_at text NOT NULL
);

-- Submitted edits. Approved rows are also the article's revision history.
CREATE TABLE wiki_article_revisions (
  id text PRIMARY KEY,
  wiki_article_id text NOT NULL,
  created_by_id text,
  crdt_update blob NOT NULL, -- LoroDocUpdate
  from_crdt_frontier json NOT NULL, -- LoroDocFrontier
  evaluation text NOT NULL, -- RevisionEvaluation
  evaluation_reason text,
  has_media_selection integer NOT NULL DEFAULT 0 CHECK (has_media_selection IN (0, 1)), -- distinguishes an empty selection from unchanged media
  evaluated_by_id text,
  evaluated_at text,
  created_at text NOT NULL,
  updated_at text NOT NULL,
  FOREIGN KEY (wiki_article_id) REFERENCES wiki_article_sources (id) ON DELETE CASCADE,
  FOREIGN KEY (created_by_id) REFERENCES people (id) ON DELETE SET NULL,
  FOREIGN KEY (evaluated_by_id) REFERENCES people (id) ON DELETE SET NULL
);

CREATE INDEX idx_wiki_article_revisions_article_evaluation ON wiki_article_revisions (wiki_article_id, evaluation);

CREATE TABLE wiki_article_revision_media_assets (
  wiki_article_revision_id text NOT NULL,
  media_asset_id text NOT NULL,
  category text,
  has_category_override integer NOT NULL DEFAULT 0 CHECK (has_category_override IN (0, 1)), -- distinguishes clearing a category from leaving it unchanged
  descriptions json,
  PRIMARY KEY (wiki_article_revision_id, media_asset_id),
  FOREIGN KEY (wiki_article_revision_id) REFERENCES wiki_article_revisions (id) ON DELETE CASCADE,
  FOREIGN KEY (media_asset_id) REFERENCES media_assets (id) ON DELETE CASCADE
);

CREATE INDEX idx_wiki_article_revision_media_assets_media_asset ON wiki_article_revision_media_assets (media_asset_id);

-- Queryable projection of the canonical CRDT state.
CREATE TABLE wiki_article_projections (
  id text PRIMARY KEY,
  kind text NOT NULL, -- WikiArticleKind
  status text NOT NULL, -- WikiArticleStatus
  attributes json NOT NULL,
  current_crdt_frontier json NOT NULL,
  created_at text NOT NULL,
  updated_at text NOT NULL,
  FOREIGN KEY (id) REFERENCES wiki_article_sources (id) ON DELETE CASCADE
);

CREATE UNIQUE INDEX idx_wiki_article_projections_id_kind ON wiki_article_projections (id, kind);

CREATE INDEX idx_wiki_article_projections_kind_status ON wiki_article_projections (kind, status);

-- Per-language queryable projection of contributor-editable CRDT data.
CREATE TABLE wiki_article_translations (
  wiki_article_id text NOT NULL,
  kind text NOT NULL, -- WikiArticleKind
  language text NOT NULL, -- SupportedLanguage
  common_names json NOT NULL,
  -- Names folded for full-text search (indexed at the end of this file): the first common name is the title
  searchable_title text NOT NULL,
  searchable_names text NOT NULL,
  content json, -- TiptapDocument
  content_plain_text text NOT NULL,
  searchable_content text NOT NULL,
  origin text,
  CHECK (
    kind = 'PLANT'
    OR origin IS NULL
  ),
  PRIMARY KEY (wiki_article_id, language),
  FOREIGN KEY (wiki_article_id, kind) REFERENCES wiki_article_projections (id, kind) ON DELETE CASCADE
);

-- Route handles, unique within the article kind. `language` is the translation a handle was
-- allocated for; handles are never replaced, so links keep working after names change.
CREATE TABLE wiki_article_handles (
  wiki_article_id text NOT NULL,
  kind text NOT NULL, -- WikiArticleKind
  handle text NOT NULL,
  language text NOT NULL, -- SupportedLanguage
  PRIMARY KEY (wiki_article_id, kind, handle),
  UNIQUE (kind, handle),
  FOREIGN KEY (wiki_article_id) REFERENCES wiki_article_sources (id) ON DELETE CASCADE
);

-- Derived relations between articles, one row per source that found them (LinkSource).
-- `related_wiki_article_id` has no foreign key: content may reference articles that are created
-- later, and reads only surface relations to published articles.
CREATE TABLE wiki_article_relations (
  wiki_article_id text NOT NULL,
  related_wiki_article_id text NOT NULL,
  source text NOT NULL, -- LinkSource
  evidence json, -- where the source established the relation; legacy tags have none
  CHECK (wiki_article_id <> related_wiki_article_id),
  CHECK ((source = 'LEGACY_TAG') = (evidence IS NULL)),
  PRIMARY KEY (wiki_article_id, related_wiki_article_id, source),
  FOREIGN KEY (wiki_article_id) REFERENCES wiki_article_sources (id) ON DELETE CASCADE
);

CREATE INDEX idx_wiki_article_relations_related ON wiki_article_relations (related_wiki_article_id);

-- ================
-- WIKI ARTICLE MEDIA UPLOADED IN THE APP
-- ================
-- External source media lives in wiki_article_external_media.
CREATE TABLE wiki_article_media_assets (
  wiki_article_id text NOT NULL,
  media_asset_id text NOT NULL,
  PRIMARY KEY (wiki_article_id, media_asset_id),
  FOREIGN KEY (wiki_article_id) REFERENCES wiki_article_sources (id) ON DELETE CASCADE,
  FOREIGN KEY (media_asset_id) REFERENCES media_assets (id) ON DELETE CASCADE
);

CREATE TABLE wiki_article_main_media (
  wiki_article_id text NOT NULL PRIMARY KEY,
  media_asset_id text NOT NULL,
  FOREIGN KEY (wiki_article_id, media_asset_id) REFERENCES wiki_article_media_assets (wiki_article_id, media_asset_id) ON DELETE CASCADE
);

-- =====
-- PUBLICATIONS
-- =====
--
-- The source of truth of all publication data: the CRDT holds what editors write together, the
-- columns what only the server or a dedicated field of the update endpoint may change.
CREATE TABLE publication_sources (
  id text NOT NULL PRIMARY KEY,
  crdt_snapshot blob NOT NULL, -- LoroSnapshot
  link_inference json, -- LinkInferenceRun
  moderation_status text NOT NULL, -- ModerationStatus
  owner_profile_id text NOT NULL,
  handle text NOT NULL UNIQUE,
  visibility text NOT NULL, -- PublicationVisibility
  published_at text NOT NULL,
  created_at text NOT NULL,
  updated_at text NOT NULL,
  FOREIGN KEY (owner_profile_id) REFERENCES profiles (id) ON DELETE CASCADE
);

CREATE INDEX idx_publication_sources_owner_profile_id ON publication_sources (owner_profile_id);

CREATE INDEX idx_publication_sources_published_at ON publication_sources (published_at);

-- How publications are modified
CREATE TABLE publication_revisions (
  id text PRIMARY KEY,
  publication_id text NOT NULL,
  created_by_id text,
  from_crdt_frontier json NOT NULL,
  crdt_update blob NOT NULL,
  updated_at text NOT NULL,
  created_at text NOT NULL,
  FOREIGN KEY (publication_id) REFERENCES publication_sources (id) ON DELETE CASCADE,
  FOREIGN KEY (created_by_id) REFERENCES people (id) ON DELETE SET NULL
);

-- Queryable projection of the canonical CRDT state.
-- `updated_at` is when the CRDT last changed.
CREATE TABLE publication_projections (
  id text PRIMARY KEY,
  current_crdt_frontier json NOT NULL,
  created_at text NOT NULL,
  updated_at text NOT NULL,
  kind text NOT NULL, -- PublicationKind
  start_date text,
  end_date text,
  location_or_url text,
  attendance_mode text, -- EventAttendanceMode
  FOREIGN KEY (id) REFERENCES publication_sources (id) ON DELETE CASCADE
);

CREATE INDEX idx_publication_projections_kind ON publication_projections (kind);

CREATE TABLE publication_translations (
  publication_id text NOT NULL,
  language text NOT NULL,
  content json NOT NULL,
  content_plain_text text NOT NULL,
  -- Folded for full-text search (indexed at the end of this file)
  searchable_content text NOT NULL,
  translated_at_crdt_frontier json NOT NULL,
  translation_source text NOT NULL, -- TranslationSource
  original_language text NOT NULL,
  PRIMARY KEY (publication_id, language),
  FOREIGN KEY (publication_id) REFERENCES publication_sources (id) ON DELETE CASCADE
);

CREATE TABLE publication_media_assets (
  publication_id text NOT NULL,
  media_asset_id text NOT NULL,
  PRIMARY KEY (publication_id, media_asset_id),
  FOREIGN KEY (publication_id) REFERENCES publication_sources (id) ON DELETE CASCADE,
  FOREIGN KEY (media_asset_id) REFERENCES media_assets (id) ON DELETE CASCADE
);

-- Derived links to the wiki articles a publication is about, one row per source that found them (LinkSource).
CREATE TABLE publication_wiki_articles (
  publication_id text NOT NULL,
  wiki_article_id text NOT NULL,
  source text NOT NULL, -- LinkSource
  evidence json, -- where the source established the link; legacy tags have none
  CHECK ((source = 'LEGACY_TAG') = (evidence IS NULL)),
  PRIMARY KEY (publication_id, wiki_article_id, source),
  FOREIGN KEY (publication_id) REFERENCES publication_sources (id) ON DELETE CASCADE,
  FOREIGN KEY (wiki_article_id) REFERENCES wiki_article_sources (id) ON DELETE CASCADE
);

-- ========
-- COMMENTS
-- ========
CREATE TABLE publication_comments (
  id text PRIMARY KEY,
  publication_id text NOT NULL,
  parent_publication_comment_id text,
  moderation_status text NOT NULL, -- ModerationStatus
  created_at text NOT NULL,
  updated_at text NOT NULL,
  owner_profile_id text NOT NULL,
  source_language text NOT NULL,
  source_content json NOT NULL,
  FOREIGN KEY (parent_publication_comment_id) REFERENCES publication_comments (id) ON DELETE CASCADE,
  FOREIGN KEY (owner_profile_id) REFERENCES profiles (id) ON DELETE CASCADE,
  FOREIGN KEY (publication_id) REFERENCES publication_sources (id) ON DELETE CASCADE
);

CREATE TABLE publication_comment_content_revisions (
  id text PRIMARY KEY,
  publication_comment_id text NOT NULL,
  created_by_id text,
  created_at text NOT NULL,
  FOREIGN KEY (publication_comment_id) REFERENCES publication_comments (id) ON DELETE CASCADE,
  FOREIGN KEY (created_by_id) REFERENCES people (id) ON DELETE SET NULL,
  UNIQUE (publication_comment_id, id)
);

CREATE INDEX idx_publication_comment_content_revisions_comment ON publication_comment_content_revisions (publication_comment_id, created_at, id);

CREATE TABLE publication_comment_translations (
  publication_comment_id text NOT NULL,
  language text NOT NULL,
  content json NOT NULL,
  content_plain_text text NOT NULL,
  translated_at_revision_id text NOT NULL,
  PRIMARY KEY (publication_comment_id, language),
  FOREIGN KEY (publication_comment_id) REFERENCES publication_comments (id) ON DELETE CASCADE,
  FOREIGN KEY (publication_comment_id, translated_at_revision_id) REFERENCES publication_comment_content_revisions (publication_comment_id, id) ON DELETE CASCADE
);

-- =========
-- BOOKMARKS
-- =========
--
CREATE TABLE bookmarks_wiki_articles (
  person_id text NOT NULL,
  wiki_article_id text NOT NULL,
  state text NOT NULL, -- BookmarkState
  PRIMARY KEY (person_id, wiki_article_id),
  FOREIGN KEY (person_id) REFERENCES people (id) ON DELETE CASCADE,
  FOREIGN KEY (wiki_article_id) REFERENCES wiki_article_sources (id) ON DELETE CASCADE
);

-- =========
-- WIKI EXTERNAL DATA
-- External provider data is separate from contributor-owned CRDT attributes.
-- =========
CREATE TABLE wiki_article_external_data_observations (
  id text NOT NULL PRIMARY KEY,
  wiki_article_id text NOT NULL REFERENCES wiki_article_sources (id) ON DELETE CASCADE,
  provider text NOT NULL, -- ExternalDataProvider
  observed_at text NOT NULL,
  article_crdt_frontier json NOT NULL,
  inputs json NOT NULL,
  outcome json NOT NULL
);

CREATE INDEX idx_external_data_observations_article_provider ON wiki_article_external_data_observations (wiki_article_id, provider, observed_at, id);

CREATE TABLE wiki_article_external_links (
  wiki_article_id text NOT NULL REFERENCES wiki_article_sources (id) ON DELETE CASCADE,
  language text NOT NULL,
  url text NOT NULL,
  PRIMARY KEY (wiki_article_id, language)
);

CREATE TABLE wiki_plant_taxonomy_group (
  wiki_article_id text NOT NULL PRIMARY KEY REFERENCES wiki_article_sources (id) ON DELETE CASCADE,
  gbif_taxon_id text NOT NULL,
  taxonomy_group text
);

CREATE INDEX idx_plant_taxon ON wiki_plant_taxonomy_group (gbif_taxon_id);

CREATE TABLE wiki_plant_taxonomy_classification (
  wiki_article_id text NOT NULL REFERENCES wiki_article_sources (id) ON DELETE CASCADE,
  taxon_id text NOT NULL,
  scientific_name text NOT NULL,
  taxon_rank text NOT NULL,
  PRIMARY KEY (wiki_article_id, taxon_rank)
);

CREATE INDEX idx_plant_classification ON wiki_plant_taxonomy_classification (taxon_rank, scientific_name);

CREATE TABLE wiki_article_external_media (
  wiki_article_id text NOT NULL REFERENCES wiki_article_sources (id) ON DELETE CASCADE,
  media_url text NOT NULL,
  source_url text NOT NULL,
  credit_line text NOT NULL,
  license_url text,
  PRIMARY KEY (wiki_article_id, media_url)
);

CREATE TABLE wiki_book_editions (
  wiki_article_id text NOT NULL REFERENCES wiki_article_sources (id) ON DELETE CASCADE,
  provider text NOT NULL,
  external_id text NOT NULL,
  title text NOT NULL,
  publisher text,
  publication_date text,
  page_count integer,
  isbn json NOT NULL,
  source_url text NOT NULL,
  PRIMARY KEY (wiki_article_id, provider, external_id)
);

CREATE TABLE wiki_book_edition_languages (
  wiki_article_id text NOT NULL,
  provider text NOT NULL,
  external_id text NOT NULL,
  language text NOT NULL,
  PRIMARY KEY (wiki_article_id, provider, external_id, language),
  FOREIGN KEY (wiki_article_id, provider, external_id) REFERENCES wiki_book_editions (wiki_article_id, provider, external_id) ON DELETE CASCADE
);

CREATE INDEX idx_book_edition_language ON wiki_book_edition_languages (language, wiki_article_id);

-- TURSO ONLY
--
-- Atlas can't parse Turso's full-text search indexes, so `scripts/migrate.ts` diffs everything
-- below this line itself (into `migrations-turso`). Only `CREATE INDEX … USING fts` belongs here.
--
-- They index the `searchable_*` columns, folded with `toSearchableText`: Turso's tokenizers don't
-- fold accents. Trigrams let a search match partial words while someone is still typing, and
-- BM25 ranks names above passing mentions in content (see `db/full-text-search.ts`).
CREATE INDEX wiki_article_translations_search ON wiki_article_translations USING fts (
  searchable_title,
  searchable_names,
  searchable_content
)
WITH
  (
    tokenizer = 'ngram',
    min_gram = 3,
    max_gram = 3,
    weights = 'searchable_title=8.0,searchable_names=4.0,searchable_content=1.0'
  );

CREATE INDEX publication_translations_search ON publication_translations USING fts (searchable_content)
WITH
  (tokenizer = 'ngram', min_gram = 3, max_gram = 3);

CREATE INDEX profiles_search ON profiles USING fts (searchable_text)
WITH
  (tokenizer = 'ngram', min_gram = 3, max_gram = 3);
