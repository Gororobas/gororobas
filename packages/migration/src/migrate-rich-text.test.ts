import { NodeServices } from "@effect/platform-node"
import { it } from "@effect/vitest"
import { IdGen, TiptapDocument } from "@gororobas/domain"
import { Effect, FileSystem, Layer, Schema } from "effect"
import { KeyValueStore } from "effect/persistence"
import { assert, expect } from "vitest"

import { migrateRichText } from "./migrate-rich-text.js"
import { GelTiptapDocument } from "./schemas/gel/rich-text.js"
import { MigrationContext, MigrationContextLive } from "./services/migration-context.js"

const encodeJson = Schema.encodeSync(Schema.fromJsonString(Schema.Unknown))

it.effect("rewrites mentions and resolves stale image IDs through the Sanity alias", () =>
  Effect.gen(function* () {
    const context = yield* MigrationContext
    const plantId = "019a0dce-1fc0-7abc-8abc-123456789abc"
    const imageId = "019a0dce-1fc0-7abc-8abc-123456789abd"

    yield* Effect.forEach(
      [
        { gelId: "plant", sqliteId: plantId, entityType: "WikiArticle" },
        { gelId: "image-sanity:mediaAsset", sqliteId: imageId, entityType: "Image" },
      ],
      (mapping) => context.registerMapping({ ...mapping, contentHash: "", lastSyncedAt: "" }),
      { concurrency: 1 },
    )

    const source = Schema.decodeSync(GelTiptapDocument)({
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
            { type: "text", text: "" },
          ],
        },
        {
          type: "image",
          attrs: {
            data: encodeJson({ image: { id: "stale", sanity_id: "mediaAsset", label: "Photo" } }),
          },
        },
      ],
    })

    const converted = yield* migrateRichText(source)
    const paragraph = converted.content[0]
    assert(paragraph.type === "paragraph")
    const mention = paragraph.content?.[0]
    const image = converted.content[1]
    assert(mention && "attrs" in mention)

    expect(mention).toEqual({
      type: "entityReference",
      attrs: {
        version: 1,
        referenceId: plantId,
        referenceType: "WIKI_ARTICLE",
        labelAtInsertion: "Açaí",
      },
    })

    expect(image).toEqual({
      type: "mediaGrid",
      attrs: {
        version: 1,
        items: [{ source: "MEDIA_ASSET", format: "IMAGE", mediaAssetId: imageId, alt: "Photo" }],
      },
    })

    expect(Schema.is(TiptapDocument)(converted)).toBe(true)
    expect(yield* migrateRichText(converted)).toEqual(converted)
    expect(paragraph.content?.[1]).toEqual(source.content[0].content?.[1])
    expect(paragraph.content).toHaveLength(2)
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

it.effect("groups adjacent media across formats, preserves nesting and keeps text boundaries", () =>
  Effect.gen(function* () {
    const imageId = "019a0dce-1fc0-7abc-8abc-123456789abc"
    const context = yield* MigrationContext

    yield* context.registerMapping({
      gelId: "photo",
      sqliteId: imageId,
      entityType: "Image",
      contentHash: "",
      lastSyncedAt: "",
    })

    const image = {
      type: "image",
      attrs: { data: encodeJson({ image: { id: "photo", label: "Photo" } }) },
    }
    const video = { type: "video", attrs: { data: encodeJson({ version: 1, id: "dQw4w9WgXcQ" }) } }

    const source = GelTiptapDocument.make({
      type: "doc",
      version: 1,
      content: [
        image,
        video,
        { type: "paragraph", content: [{ type: "text", text: "Between" }] },
        { type: "blockquote", content: [video, image] },
      ],
    })

    const migrated = yield* migrateRichText(source)
    expect(migrated.content).toHaveLength(3)

    expect(migrated.content[0]).toMatchObject({
      type: "mediaGrid",
      attrs: {
        items: [
          { source: "MEDIA_ASSET", mediaAssetId: imageId, format: "IMAGE", alt: "Photo" },
          {
            source: "EXTERNAL_EMBED",
            version: 1,
            provider: "YOUTUBE",
            providerData: { videoId: "dQw4w9WgXcQ" },
          },
        ],
      },
    })

    expect(migrated.content[1]).toEqual(source.content[2])
    const blockquote = migrated.content[2]
    assert(blockquote.type === "blockquote")
    expect(blockquote.content).toHaveLength(1)

    expect(blockquote.content?.[0]).toMatchObject({
      type: "mediaGrid",
      attrs: {
        items: [{ source: "EXTERNAL_EMBED", provider: "YOUTUBE" }, { source: "MEDIA_ASSET" }],
      },
    })

    expect(yield* migrateRichText(migrated)).toEqual(migrated)

    const malformed = GelTiptapDocument.make({
      type: "doc",
      version: 1,
      content: [{ type: "video", attrs: { data: encodeJson({ id: "invalid" }) } }],
    })

    expect(yield* migrateRichText(malformed).pipe(Effect.flip)).toMatchObject({
      _tag: "SchemaError",
    })
  }).pipe(
    Effect.provide(MigrationContextLive.pipe(Layer.provide(KeyValueStore.layerMemory))),
    Effect.provideService(IdGen, { generate: () => "019a0dce-1fc0-7abc-8abc-123456789abe" }),
    Effect.provide(NodeServices.layer),
  ),
)
