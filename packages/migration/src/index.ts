/**
 * Gel to SQLite Migration CLI
 */
import { NodeRuntime, NodeServices } from "@effect/platform-node"
import { IdGenLive } from "@gororobas/server/id-gen-live"
import { Effect } from "effect"
import { Layer } from "effect"
import { Command } from "effect/unstable/cli"
import { KeyValueStore } from "effect/unstable/persistence"

import { GelClientLive } from "./gel-client.js"
import { migrate } from "./migration.js"
import { MigrationContextLive } from "./services/migration-context.js"

Command.run(migrate, { version: "0.0.0" }).pipe(
  Effect.provide(
    MigrationContextLive.pipe(
      Layer.provide(
        KeyValueStore.layerFileSystem(new URL("../debug/id-mappings", import.meta.url).pathname),
      ),
    ),
  ),
  Effect.provide(Layer.mergeAll(NodeServices.layer, GelClientLive, IdGenLive)),
  NodeRuntime.runMain,
)
