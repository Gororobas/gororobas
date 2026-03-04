/**
 * Main migration orchestrator.
 */
import { Effect, Layer } from "effect"

import { MigrationContextLive } from "./services/migration-context.js"

// ============ Migration Layers ============

const MigrationLive = Layer.merge(MigrationContextLive)

// ============ Migration Interface ============

export interface MigrationConfig {
  gelConnectionString: string
  sqliteConnectionString: string
}

export const runMigration = (_config: MigrationConfig) =>
  Effect.gen(function* () {
    yield* Effect.logInfo("Starting Gel to SQLite migration")

    // TODO: Implement the actual migration steps
  }).pipe(Effect.provide(MigrationLive), Effect.withLogSpan("migration"))

// ============ CLI Entry Point ============

export const main = (config: MigrationConfig) =>
  Effect.gen(function* () {
    yield* runMigration(config)
  }).pipe(
    Effect.catchAll((error) => Effect.logError("Migration failed: ", error).pipe(Effect.asVoid)),
    Effect.runPromise,
  )
