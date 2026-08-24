/**
 * Gel to SQLite Migration CLI
 */
import { NodeRuntime } from "@effect/platform-node"
import { Effect } from "effect"

import { runMigration } from "./migration.js"

NodeRuntime.runMain(
  runMigration.pipe(
    Effect.catchCause((cause) => Effect.logError("Migration failed", cause).pipe(Effect.asVoid)),
  ),
)
