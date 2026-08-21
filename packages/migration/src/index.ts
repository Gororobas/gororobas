/**
 * Gel to SQLite Migration CLI
 */
import { BunRuntime } from "@effect/platform-bun"
import { Effect } from "effect"

import { runMigration } from "./migration.js"

BunRuntime.runMain(
  runMigration.pipe(
    Effect.catchCause((cause) => Effect.logError("Migration failed", cause).pipe(Effect.asVoid)),
  ),
)
