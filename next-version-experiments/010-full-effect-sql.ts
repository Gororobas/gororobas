import { BunContext, BunRuntime } from '@effect/platform-bun'
import { SqlClient } from '@effect/sql'
import { SqliteClient, SqliteMigrator } from '@effect/sql-sqlite-bun'
import { Effect, Layer, pipe } from 'effect'

const SqlLive = SqliteClient.layer({
	// filename: '010-full-effect-sql.db',
	filename: ':memory:',
})

const MigratorLive = Layer.provide(
	SqliteMigrator.layer({
		loader: SqliteMigrator.fromRecord({
			'0001_create_tables': Effect.gen(function* () {
				const sql = yield* SqlClient.SqlClient

				/** #1 Better Auth schema */
				yield* sql`CREATE TABLE users (
    				id	TEXT	PRIMARY KEY,
            name	TEXT NOT NULL,
            email	string TEXT NOT NULL,
            emailVerified	BOOLEAN NOT NULL,
            image	TEXT,
            createdAt	TEXT NOT NULL,
            updatedAt	TEXT NOT NULL
  			);`

				/** #2 App schema */
				yield* sql`CREATE TABLE user_profiles (
			  user_id TEXT NOT NULL UNIQUE,
			  handle TEXT NOT NULL UNIQUE,
			  name TEXT NOT NULL,
			  bio JSON,
			  location TEXT,
			  photo_id TEXT,
			  created_at TEXT DEFAULT (datetime('now')),
			  updated_at TEXT DEFAULT (datetime('now')),
			  created_by_id TEXT,
			  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
			  FOREIGN KEY (photo_id) REFERENCES images(id) ON DELETE SET NULL,
			  FOREIGN KEY (created_by_id) REFERENCES user_profiles(id) ON DELETE SET NULL
			);`

				yield* sql`CREATE INDEX idx_user_profiles_handle ON user_profiles(handle);`

				yield* sql`CREATE TABLE tags (
			  handle TEXT NOT NULL UNIQUE,
			  names JSON NOT NULL,
			  description JSON,
			  category TEXT,
			  created_at TEXT DEFAULT (datetime('now')),
			  updated_at TEXT DEFAULT (datetime('now')),
			  created_by_id TEXT
			);`

				yield* sql`CREATE INDEX idx_tags_handle ON tags(handle);`

				yield* sql`CREATE TABLE images (
			  sanity_id TEXT NOT NULL UNIQUE,
			  label TEXT,
			  hotspot JSON,
			  crop JSON,
			  metadata JSON,
			  created_at TEXT DEFAULT (datetime('now')),
			  updated_at TEXT DEFAULT (datetime('now')),
			  submitted_by_user_profile_id TEXT,
			  FOREIGN KEY (submitted_by_user_profile_id) REFERENCES user_profiles(id)
			);`

				yield* sql`CREATE TABLE image_credits (
			  image_id INTEGER NOT NULL,
				order_index INTEGER NOT NULL,
				credit_line TEXT,
				credit_url TEXT,
				user_profile_id INTEGER,
				PRIMARY KEY (image_id, order_index),
			  FOREIGN KEY (image_id) REFERENCES images(id) ON DELETE CASCADE,
			  FOREIGN KEY (user_profile_id) REFERENCES user_profiles(id) ON DELETE CASCADE
			);`

				yield* sql`CREATE TABLE vegetable_varieties (
			  vegetable_id TEXT NOT NULL,
			  handle TEXT NOT NULL UNIQUE,
			  names JSON NOT NULL,
			  created_at TEXT DEFAULT (datetime('now')),
			  updated_at TEXT DEFAULT (datetime('now')),
			  created_by_id TEXT,
				FOREIGN KEY (vegetable_id) REFERENCES vegetables(id) ON DELETE CASCADE
			);`

				yield* sql`CREATE INDEX idx_vegetable_varieties_handle ON vegetable_varieties(handle);`

				yield* sql`CREATE TABLE vegetable_variety_photos (
			  variety_id TEXT NOT NULL,
			  image_id TEXT NOT NULL,
			  order_index INTEGER,
			  PRIMARY KEY (variety_id, image_id),
			  FOREIGN KEY (variety_id) REFERENCES vegetable_varieties(id) ON DELETE CASCADE,
			  FOREIGN KEY (image_id) REFERENCES images(id) ON DELETE CASCADE
			);`

				yield* sql`CREATE TABLE vegetables (
			  scientific_names JSON,
			  development_cycle_min INTEGER,
			  development_cycle_max INTEGER,
			  height_min REAL,
			  height_max REAL,
			  temperature_min REAL,
			  temperature_max REAL,
			  content JSON,
			  created_at TEXT DEFAULT (datetime('now')),
			  updated_at TEXT DEFAULT (datetime('now')),
			  created_by_id TEXT,
				main_photo_id INTEGER,
		    FOREIGN KEY (main_photo_id) REFERENCES images(id) ON DELETE SET NULL
			);`

				yield* sql`CREATE TABLE vegetable_translations (
				vegetable_id INTEGER NOT NULL,
				locale TEXT NOT NULL,
			  handle TEXT NOT NULL,
			  names JSON NOT NULL,
			  searchable_names TEXT,
			  gender TEXT,
			  origin TEXT,
			  content JSON,

				UNIQUE(locale, handle),
			  PRIMARY KEY (vegetable_id, locale),
		    FOREIGN KEY (vegetable_id) REFERENCES vegetables(id) ON DELETE CASCADE
			);`

				yield* sql`CREATE INDEX idx_vegetables_handle ON vegetable_translations(handle);`
				yield* sql`CREATE INDEX idx_vegetables_searchable_names ON vegetable_translations(searchable_names);`

				yield* sql`CREATE TABLE vegetable_strata (
			  vegetable_id TEXT NOT NULL,
			  stratum TEXT NOT NULL,
			  FOREIGN KEY (vegetable_id) REFERENCES vegetables(id) ON DELETE CASCADE
			);`

				yield* sql`CREATE TABLE vegetable_planting_methods (
			  vegetable_id TEXT NOT NULL,
			  method TEXT NOT NULL,
			  FOREIGN KEY (vegetable_id) REFERENCES vegetables(id) ON DELETE CASCADE
			);`

				yield* sql`CREATE TABLE vegetable_edible_parts (
			  vegetable_id TEXT NOT NULL,
			  part TEXT NOT NULL,
			  FOREIGN KEY (vegetable_id) REFERENCES vegetables(id) ON DELETE CASCADE
			);`

				yield* sql`CREATE TABLE vegetable_lifecycles (
			  vegetable_id TEXT NOT NULL,
			  lifecycle TEXT NOT NULL,
			  FOREIGN KEY (vegetable_id) REFERENCES vegetables(id) ON DELETE CASCADE
			);`

				yield* sql`CREATE TABLE vegetable_uses (
			  vegetable_id TEXT NOT NULL,
			  use TEXT NOT NULL,
			  FOREIGN KEY (vegetable_id) REFERENCES vegetables(id) ON DELETE CASCADE
			);`

				yield* sql`CREATE TABLE vegetable_photos (
			  vegetable_id TEXT NOT NULL,
			  image_id TEXT NOT NULL,
			  order_index INTEGER,

			  PRIMARY KEY (vegetable_id, image_id),
			  FOREIGN KEY (vegetable_id) REFERENCES vegetables(id) ON DELETE CASCADE,
			  FOREIGN KEY (image_id) REFERENCES images(id) ON DELETE CASCADE
			);`

				// Metadata for images used as vegetable photos (one row per unique image)
				yield* sql`
        CREATE TABLE vegetable_photo_metadata (
          image_id TEXT PRIMARY KEY,
          category TEXT NOT NULL,         -- app-controlled: 'seed', 'seedling', 'fruit', etc.
          description JSON,               -- optional description

          approval_status TEXT CHECK(approval_status IN ('PENDING', 'APPROVED', 'REJECTED')) DEFAULT 'PENDING',

          created_at TEXT DEFAULT (datetime('now')),
          updated_at TEXT DEFAULT (datetime('now')),

          FOREIGN KEY (image_id) REFERENCES images(id) ON DELETE CASCADE
        );`

				yield* sql`CREATE TABLE vegetable_friendships (
			  vegetable_id TEXT NOT NULL,
			  friend_id TEXT NOT NULL,
			  unique_key TEXT NOT NULL UNIQUE,
			  created_at TEXT DEFAULT (datetime('now')),
			  updated_at TEXT DEFAULT (datetime('now')),
			  created_by_id TEXT,
			  FOREIGN KEY (vegetable_id) REFERENCES vegetables(id) ON DELETE CASCADE,
			  FOREIGN KEY (friend_id) REFERENCES vegetables(id) ON DELETE CASCADE,
			  CHECK (vegetable_id < friend_id)
			);`

				yield* sql`CREATE TABLE user_wishlists (
			  user_profile_id TEXT NOT NULL,
			  vegetable_id TEXT NOT NULL,
			  status TEXT NOT NULL,
			  PRIMARY KEY (user_profile_id, vegetable_id),
			  FOREIGN KEY (user_profile_id) REFERENCES user_profiles(id) ON DELETE CASCADE,
			  FOREIGN KEY (vegetable_id) REFERENCES vegetables(id) ON DELETE CASCADE
			);`

				yield* sql`CREATE TABLE notes (
			  handle TEXT NOT NULL UNIQUE,
			  publish_status TEXT,
			  published_at TEXT DEFAULT (datetime('now')),
			  created_at TEXT DEFAULT (datetime('now')),
			  updated_at TEXT DEFAULT (datetime('now')),
			  created_by_id TEXT NOT NULL,
			  FOREIGN KEY (created_by_id) REFERENCES user_profiles(id) ON DELETE CASCADE
			);`

				yield* sql`CREATE INDEX idx_notes_handle ON notes(handle);`

				yield* sql`CREATE TABLE note_translations (
          note_id INTEGER NOT NULL,
          locale TEXT NOT NULL,
          content JSON NOT NULL,
          content_plain_text TEXT DEFAULT '',
          translated_at TEXT DEFAULT (datetime('now')),
          original_content_hash TEXT NOT NULL,
          translation_source TEXT NOT NULL, -- Original, Automatic, Manual
          original_locale TEXT NOT NULL,

          PRIMARY KEY (note_id, locale),
          FOREIGN KEY (note_id) REFERENCES notes(id) ON DELETE CASCADE
        );`

				yield* sql`CREATE TABLE note_tags (
			  note_id TEXT NOT NULL,
			  tag_id TEXT NOT NULL,
			  PRIMARY KEY (note_id, tag_id),
			  FOREIGN KEY (note_id) REFERENCES notes(id) ON DELETE CASCADE,
			  FOREIGN KEY (tag_id) REFERENCES tags(id) ON DELETE CASCADE
			);`

				yield* sql`CREATE TABLE note_vegetables (
			  note_id TEXT NOT NULL,
			  vegetable_id TEXT NOT NULL,
			  PRIMARY KEY (note_id, vegetable_id),
			  FOREIGN KEY (note_id) REFERENCES notes(id) ON DELETE CASCADE,
			  FOREIGN KEY (vegetable_id) REFERENCES vegetables(id) ON DELETE CASCADE
			);`

				yield* sql`CREATE TABLE edit_suggestions (
			  vegetable_id TEXT NOT NULL,
			  diff JSON NOT NULL,
			  snapshot JSON NOT NULL,
			  status TEXT NOT NULL,
			  reviewed_by_id TEXT,
			  created_at TEXT DEFAULT (datetime('now')),
			  updated_at TEXT DEFAULT (datetime('now')),
			  created_by_id TEXT,
			  FOREIGN KEY (vegetable_id) REFERENCES vegetables(id) ON DELETE CASCADE,
			  FOREIGN KEY (reviewed_by_id) REFERENCES user_profiles(id) ON DELETE SET NULL
			);`

				yield* sql`CREATE TABLE resources (
  			  handle TEXT NOT NULL UNIQUE,
  			  url TEXT NOT NULL UNIQUE,
  			  format TEXT NOT NULL,
  			  thumbnail_id TEXT,
  			  created_at TEXT DEFAULT (datetime('now')),
  			  updated_at TEXT DEFAULT (datetime('now')),
  			  created_by_id TEXT,
  			  FOREIGN KEY (thumbnail_id) REFERENCES images(id) ON DELETE SET NULL
  			);`

				yield* sql`CREATE TABLE resource_translations (
					resource_id INTEGER NOT NULL,
          locale TEXT NOT NULL,
          title TEXT NOT NULL,
  			  description JSON,
  			  credit_line TEXT,
          translated_at TEXT DEFAULT (datetime('now')),
          original_content_hash TEXT NOT NULL,
          translation_source TEXT NOT NULL, -- Original, Automatic, Manual
          original_locale TEXT NOT NULL,

          PRIMARY KEY (resource_id, locale),
          FOREIGN KEY (resource_id) REFERENCES resources(id) ON DELETE CASCADE
			);`

				yield* sql`CREATE INDEX idx_resources_handle ON resources(handle);`

				yield* sql`CREATE TABLE resource_tags (
			  resource_id TEXT NOT NULL,
			  tag_id TEXT NOT NULL,
			  PRIMARY KEY (resource_id, tag_id),
			  FOREIGN KEY (resource_id) REFERENCES resources(id) ON DELETE CASCADE,
			  FOREIGN KEY (tag_id) REFERENCES tags(id) ON DELETE CASCADE
			);`

				yield* sql`CREATE TABLE resource_vegetables (
			  resource_id TEXT NOT NULL,
			  vegetable_id TEXT NOT NULL,
			  order_index INTEGER,
			  PRIMARY KEY (resource_id, vegetable_id),
			  FOREIGN KEY (resource_id) REFERENCES resources(id) ON DELETE CASCADE,
			  FOREIGN KEY (vegetable_id) REFERENCES vegetables(id) ON DELETE CASCADE
			);`
			}),
		}),
	}),
	SqlLive,
)

const EnvLive = Layer.mergeAll(SqlLive, MigratorLive).pipe(
	Layer.provide(BunContext.layer),
)

const program = Effect.gen(function* () {
	const sql = yield* SqlClient.SqlClient

	yield* Effect.logInfo(
		yield* sql`SELECT name FROM sqlite_master WHERE type='table' ORDER BY name;`,
	)
})

pipe(program, Effect.provide(EnvLive), BunRuntime.runMain)
