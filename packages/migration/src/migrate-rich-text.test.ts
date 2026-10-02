import { NodeServices } from "@effect/platform-node"
import { it } from "@effect/vitest"
import { IdGen, TiptapDocument } from "@gororobas/domain"
import { Effect, FileSystem, Layer, Schema } from "effect"
import { KeyValueStore } from "effect/unstable/persistence"
import { assert, expect } from "vitest"

import { migrateRichText } from "./migrate-rich-text.js"
import { MigrationContext, MigrationContextLive } from "./services/migration-context.js"

const encodeJson = Schema.encodeSync(Schema.fromJsonString(Schema.Unknown))
const decodeJson = Schema.decodeUnknownSync(Schema.fromJsonString(Schema.Unknown))

it.effect("rewrites mentions and resolves stale image IDs through the Sanity alias", () =>
  Effect.gen(function* () {
    const context = yield* MigrationContext
    const plantId = "019a0dce-1fc0-7abc-8abc-123456789abc"
    const imageId = "019a0dce-1fc0-7abc-8abc-123456789abd"
    yield* Effect.forEach(
      [
        { gelId: "plant", sqliteId: plantId, entityType: "WikiArticle" },
        { gelId: "image-sanity:asset", sqliteId: imageId, entityType: "Image" },
      ],
      (mapping) => context.registerMapping({ ...mapping, contentHash: "", lastSyncedAt: "" }),
      { concurrency: 1 },
    )
    const source = Schema.decodeUnknownSync(TiptapDocument)({
      type: "doc",
      version: 1,
      content: [
        {
          type: "paragraph",
          content: [
            {
              type: "mention",
              attrs: {
                data: encodeJson({ id: "plant", objectType: "Vegetable", label: "Açaí" }),
              },
            },
            { type: "text", text: " preserved", marks: [{ type: "bold" }] },
          ],
        },
        {
          type: "image",
          attrs: {
            data: encodeJson({ image: { id: "stale", sanity_id: "asset", label: "Photo" } }),
          },
        },
      ],
    })
    const converted = yield* migrateRichText(source)
    const mention = converted.content[0].content?.[0]
    const image = converted.content[1]
    assert(mention && "attrs" in mention)
    expect(decodeJson(mention?.attrs?.data ?? "null")).toEqual({
      id: plantId,
      objectType: "WikiArticle",
      label: "Açaí",
    })
    expect(decodeJson(image.attrs?.data ?? "null")).toEqual({
      image: { id: imageId, sanity_id: "asset", label: "Photo" },
    })
    expect(converted.content[0].content?.[1]).toEqual(source.content[0].content?.[1])
    expect(source.content[1].attrs?.data).toContain("stale")
    expect(yield* context.resolveId("stale", "Image")).toBe(imageId)
  }).pipe(
    Effect.provide(MigrationContextLive.pipe(Layer.provide(KeyValueStore.layerMemory))),
    Effect.provideService(IdGen, { generate: () => "019a0dce-1fc0-7abc-8abc-123456789abe" }),
    Effect.provideService(
      FileSystem.FileSystem,
      FileSystem.makeNoop({
        makeDirectory: () => Effect.void,
        writeFileString: () => Effect.void,
      }),
    ),
    Effect.provide(NodeServices.layer),
  ),
)
