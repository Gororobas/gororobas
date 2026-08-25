/**
 * Gel to SQLite Migration CLI
 */
import { NodeRuntime, NodeServices } from "@effect/platform-node"
import { Effect } from "effect"
import { Layer } from "effect"
import { Command } from "effect/unstable/cli"

import { GelClientLive } from "./gel-client.js"
import { migrate } from "./migration.js"

Command.run(migrate, { version: "0.0.0" }).pipe(
  Effect.provide(Layer.mergeAll(NodeServices.layer, GelClientLive)),
  NodeRuntime.runMain,
)
