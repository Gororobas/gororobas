import { IdGen, SessionContext, type Session } from "@gororobas/domain"
import { Effect, Layer } from "effect"
/**
 * Test infrastructure helpers for Effect-based testing.
 */
import { SqlClient } from "effect/unstable/sql"
import { SqlError } from "effect/unstable/sql/SqlError"
import { v7 } from "uuid"

import { PeopleRepository } from "../src/people/repository.js"
import { ProfilesRepository } from "../src/profiles/repository.js"
import { AppSqlTest } from "../src/sql.js"

/**
 * Test database layer using AppSqlTest (in-memory SQLite with migrations).
 *
 * AppSqlTest provides:
 * - In-memory SQLite database (":memory:")
 * - Automatic schema migrations from production
 * - Column name transformations (snake_case ↔ camelCase)
 *
 * Database schema is identical to production - no test-specific schema changes.
 */
export const TestSqlLayer = AppSqlTest

/**
 * Reset database between tests by deleting all data.
 *
 * Note: We DELETE data rather than recreating the database to preserve
 * the schema and avoid re-running migrations on every test.
 *
 * Tables are deleted in reverse dependency order to avoid foreign key violations.
 */
export const resetDatabase = Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient

  // Delete in reverse dependency order to avoid foreign key violations
  // Comments and their related tables
  yield* sql`DELETE FROM comment_translations`
  yield* sql`DELETE FROM comment_commits`
  yield* sql`DELETE FROM comments`
  yield* sql`DELETE FROM comment_crdts`

  // Bookmarks
  yield* sql`DELETE FROM bookmarks_resources`
  yield* sql`DELETE FROM bookmarks_vegetables`

  // Posts and their related tables
  yield* sql`DELETE FROM post_vegetables`
  yield* sql`DELETE FROM post_tags`
  yield* sql`DELETE FROM post_translations`
  yield* sql`DELETE FROM posts`
  yield* sql`DELETE FROM post_commits`
  yield* sql`DELETE FROM post_crdts`

  // Resources and their related tables
  yield* sql`DELETE FROM resource_vegetables`
  yield* sql`DELETE FROM resource_tags`
  yield* sql`DELETE FROM resource_translations`
  yield* sql`DELETE FROM resources`
  yield* sql`DELETE FROM resource_revisions`
  yield* sql`DELETE FROM resource_crdts`

  // Vegetables and their related tables
  yield* sql`DELETE FROM vegetable_photo_metadata`
  yield* sql`DELETE FROM vegetable_photos`
  yield* sql`DELETE FROM vegetable_variety_photos`
  yield* sql`DELETE FROM vegetable_variety_translations`
  yield* sql`DELETE FROM vegetable_varieties`
  yield* sql`DELETE FROM vegetable_uses`
  yield* sql`DELETE FROM vegetable_lifecycles`
  yield* sql`DELETE FROM vegetable_edible_parts`
  yield* sql`DELETE FROM vegetable_planting_methods`
  yield* sql`DELETE FROM vegetable_strata`
  yield* sql`DELETE FROM vegetable_translations`
  yield* sql`DELETE FROM vegetables`
  yield* sql`DELETE FROM vegetable_revisions`
  yield* sql`DELETE FROM vegetable_crdts`

  // Images and their related tables
  yield* sql`DELETE FROM image_credits`
  yield* sql`DELETE FROM images`

  // Tags
  yield* sql`DELETE FROM suggested_tag_sources`
  yield* sql`DELETE FROM suggested_tags`
  yield* sql`DELETE FROM tags`

  // Organization invitations
  yield* sql`DELETE FROM organization_invitations`

  // Organization memberships
  yield* sql`DELETE FROM organization_memberships`

  // Organizations
  yield* sql`DELETE FROM organizations`

  // Profiles (includes people via CASCADE)
  yield* sql`DELETE FROM profiles`

  // People (should already be deleted via CASCADE from profiles)
  yield* sql`DELETE FROM people`

  // Better Auth tables
  yield* sql`DELETE FROM verifications`
  yield* sql`DELETE FROM oauth_accounts`
  yield* sql`DELETE FROM sessions`
  yield* sql`DELETE FROM accounts`

  // Reset any sequences if needed
  // SQLite doesn't have sequences, but if using AUTOINCREMENT:
  // yield* sql`DELETE FROM sqlite_sequence`
})

/**
 * Run an effect with a test session context.
 *
 * This helper provides a session to effects that require SessionContext.
 */
export const withSession = <A, E, R>(
  effect: Effect.Effect<A, E, R | SessionContext>,
  session: Session,
): Effect.Effect<A, E, Exclude<R, SessionContext>> =>
  effect.pipe(Effect.provide(Layer.succeed(SessionContext, session)))

/**
 * IdGen test layer that generates UUIDv7 identifiers.
 *
 * Uses the same UUID generation strategy as production.
 */
export const IdGenTest = Layer.succeed(IdGen, {
  generate: () => v7(),
})

/**
 * Compose test layers for common test scenarios.
 *
 * Includes:
 * - TestSqlLayer: In-memory SQLite with migrations
 * - IdGenTest: UUID generation
 * - PeopleRepository: People data access layer
 * - ProfilesRepository: Profiles data access layer
 */
export const TestLayer = Layer.mergeAll(
  TestSqlLayer,
  IdGenTest,
  PeopleRepository.Default,
  ProfilesRepository.Default,
)

/**
 * Helper to run tests with automatic database reset.
 *
 * Ensures each test starts with a clean database state.
 * Note: This adds SqlError to the error channel since database operations can fail.
 */
export const withCleanDatabase = <A, E, R>(
  effect: Effect.Effect<A, E, R>,
): Effect.Effect<A, SqlError | E, R | SqlClient.SqlClient> =>
  Effect.gen(function* () {
    yield* resetDatabase
    return yield* effect
  })
