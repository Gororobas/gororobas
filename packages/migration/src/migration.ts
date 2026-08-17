/**
 * Main migration orchestrator.
 */
import { Effect } from "effect"

// ============ Migration Interface ============

export interface MigrationConfig {
  gelConnectionString: string
  sqliteConnectionString: string
}

export const runMigration = (_config: MigrationConfig) =>
  Effect.gen(function* () {
    yield* Effect.logInfo("Starting Gel to SQLite migration")

    // TODO: Implement the actual migration steps
  }).pipe(Effect.withLogSpan("migration"))

// ============ CLI Entry Point ============

export const main = (config: MigrationConfig) =>
  Effect.gen(function* () {
    yield* runMigration(config)
  }).pipe(
    Effect.catchCause((cause) => Effect.logError("Migration failed", cause).pipe(Effect.asVoid)),
    Effect.runPromise,
  )
