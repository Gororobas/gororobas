/**
 * Main migration orchestrator.
 */
import { Config, Effect } from "effect"

export const runMigration = Effect.gen(function* () {
  const config = {
    gelConnectionString: yield* (
      Config.redacted("GEL_CONNECTION_STRING") || "gel://localhost:5656/gororobas"
    ),
    sqliteConnectionString: yield* (
      Config.redacted("SQLITE_CONNECTION_STRING") || "file:migration.db"
    ),
  }
  yield* Effect.logInfo("Starting Gel to SQLite migration", config)

  // TODO: Implement the actual migration steps
}).pipe(Effect.withLogSpan("migration"))
