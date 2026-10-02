import { NodeServices } from "@effect/platform-node"
import { it } from "@effect/vitest"
import { Effect, FileSystem, Layer, Schema } from "effect"
import { KeyValueStore } from "effect/unstable/persistence"
import { assert, expect } from "vitest"

import { GelTag } from "../schemas/gel/entities.js"
import { MigrationContext, MigrationContextLive } from "./migration-context.js"

it.effect("defaults missing tag dates to the agreed UTC timestamp", () =>
  Effect.sync(() => {
    const tag = Schema.decodeUnknownSync(GelTag)({ id: "old-tag", names: ["Test"], handle: "test" })
    expect(tag.created_at.toISOString()).toBe("2025-04-01T12:00:00.000Z")
  }),
)

it.effect(
  "persists mappings across fresh contexts and updates only after successful execution",
  () =>
    Effect.scoped(
      Effect.gen(function* () {
        const fs = yield* FileSystem.FileSystem
        const directory = yield* fs.makeTempDirectoryScoped()
        const layer = () =>
          Layer.fresh(
            MigrationContextLive.pipe(Layer.provide(KeyValueStore.layerFileSystem(directory))),
          )
        const source = { id: "gel-tag", name: "original" }
        const mappedId = "019a0dce-1fc0-7abc-8abc-123456789abc"
        yield* Effect.gen(function* () {
          const context = yield* MigrationContext
          const operation = yield* context.planMigrationOp(source, "Tag")
          assert(operation.op === "create")
          yield* operation.execute(() => Effect.succeed(mappedId))
        }).pipe(Effect.provide(layer()))
        yield* Effect.gen(function* () {
          const context = yield* MigrationContext
          expect(yield* context.resolveId(source.id, "Tag")).toBe(mappedId)
          expect((yield* context.planMigrationOp(source, "Tag")).op).toBe("skip")
          const changed = { ...source, name: "updated" }
          const operation = yield* context.planMigrationOp(changed, "Tag")
          assert(operation.op === "update")
          yield* operation.execute(() => Effect.fail("failed write")).pipe(Effect.flip)
          expect((yield* context.planMigrationOp(source, "Tag")).op).toBe("skip")
          yield* operation.execute(() => Effect.void)
          expect((yield* context.planMigrationOp(changed, "Tag")).op).toBe("skip")
          expect(yield* context.resolveId(source.id, "Tag")).toBe(mappedId)
          expect((yield* context.resolveId(source.id, "Other").pipe(Effect.flip))._tag).toBe(
            "GelIdNotMappedError",
          )
        }).pipe(Effect.provide(layer()))
      }),
    ).pipe(Effect.provide(NodeServices.layer)),
)
