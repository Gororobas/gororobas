/**
 * The gazetteer database's tables, shared by `scripts/build-gazetteer.ts` and the in-memory
 * fixture tests and the seeded API use.
 *
 * It's read-only at runtime and rebuilt from Who's On First rather than migrated.
 */
import { Effect } from "effect"
import { SqlClient } from "effect/sql"

export const GAZETTEER_SCHEMA_STATEMENTS = [
  `CREATE TABLE gazetteer_places (
    id INTEGER PRIMARY KEY, -- Who's On First ID
    place_kind TEXT NOT NULL, -- GazetteerPlaceKind
    country_code TEXT NOT NULL,
    name TEXT NOT NULL, -- in the country's own language
    min_longitude REAL NOT NULL,
    min_latitude REAL NOT NULL,
    max_longitude REAL NOT NULL,
    max_latitude REAL NOT NULL,
    wikidata_id TEXT,
    geonames_id TEXT,
    geometry TEXT NOT NULL, -- AreaGeometry, for finding which place contains a point
    simplified_geometry TEXT NOT NULL -- AreaGeometry, for display
  )`,
  `CREATE INDEX gazetteer_places_by_bounds ON gazetteer_places (place_kind, min_latitude, max_latitude)`,
  // Every name a place goes by: its own in several languages, and the towns within it (aliases),
  // so searching a town finds its municipality.
  `CREATE TABLE gazetteer_place_names (
    place_id INTEGER NOT NULL,
    language TEXT, -- SupportedLanguage, or NULL for aliases
    name TEXT NOT NULL,
    folded_name TEXT NOT NULL, -- toSearchableText(name)
    is_preferred INTEGER NOT NULL CHECK (is_preferred IN (0, 1)),
    is_alias INTEGER NOT NULL CHECK (is_alias IN (0, 1))
  )`,
  `CREATE INDEX gazetteer_place_names_by_place ON gazetteer_place_names (place_id, language)`,
  `CREATE TABLE gazetteer_place_ancestors (
    place_id INTEGER NOT NULL,
    ancestor_id INTEGER NOT NULL,
    depth INTEGER NOT NULL, -- 1 for the parent, 2 for the grandparent…
    PRIMARY KEY (place_id, ancestor_id)
  )`,
] as const

export const createGazetteerSchema = SqlClient.SqlClient.use((sql) =>
  Effect.forEach(GAZETTEER_SCHEMA_STATEMENTS, (statement) => sql.unsafe(statement), {
    concurrency: 1,
    discard: true,
  }),
)
