import { Effect, FileSystem, Path, Predicate, Schema } from "effect"

import { GelClient } from "./gel-client.js"
import { archiveGelResult } from "./preview-exports.js"
import { ensureMappedId, MigrationContext } from "./services/migration-context.js"

const ReferenceSource = Schema.Struct({
  id: Schema.String,
  handle: Schema.optional(Schema.String),
  name: Schema.optional(Schema.String),
  names: Schema.optional(Schema.Array(Schema.String)),
  title: Schema.optional(Schema.Unknown),
  sanity_id: Schema.optional(Schema.String),
})

export const sourceGelIdMappings = Effect.gen(function* () {
  const client = yield* GelClient
  const fs = yield* FileSystem.FileSystem
  const path = yield* Path.Path
  const context = yield* MigrationContext
  const directory = path.join(import.meta.dirname, "..", "debug")
  const references: Array<{
    id: string
    gelId: string
    entityType: string
    collection: string
    handle?: string
    label: string
    sanityId?: string
  }> = []
  yield* Effect.forEach(
    [
      ["select UserProfile { id, handle, name }", "Profile", "profiles"],
      ["select User { id }", "Account", "accounts"],
      ["select Vegetable { id, handle, names }", "WikiArticle", "plants"],
      ["select VegetableVariety { id, handle, names }", "WikiArticle", "cultivars"],
      ["select Resource { id, handle, title }", "WikiArticle", "resources"],
      [
        "select Note { id, handle } filter .publish_status != NotePublishStatus.PRIVATE",
        "Publication",
        "notes",
      ],
      ["select Image { id, sanity_id, label, crop, hotspot, sources: { * } }", "Image", "images"],
    ],
    ([query, entityType, collection]) =>
      Effect.gen(function* () {
        const records = yield* client
          .use((gel) => gel.query(query))
          .pipe(Effect.tap(archiveGelResult(`references-${collection}`)))
        yield* Effect.forEach(
          records,
          (record) =>
            Effect.gen(function* () {
              const source = yield* Schema.decodeUnknownEffect(ReferenceSource)(record)
              const id = yield* ensureMappedId({ id: source.id }, entityType)
              references.push({
                id,
                gelId: source.id,
                entityType,
                collection,
                ...(source.handle ? { handle: source.handle } : {}),
                label:
                  source.name ??
                  source.names?.join(" / ") ??
                  (Predicate.isString(source.title) ? source.title : source.handle) ??
                  source.sanity_id ??
                  source.id,
                ...(source.sanity_id ? { sanityId: source.sanity_id } : {}),
              })
              if (source.sanity_id) {
                yield* context.registerMapping({
                  gelId: `image-sanity:${source.sanity_id}`,
                  sqliteId: id,
                  entityType: "Image",
                  contentHash: source.sanity_id,
                  lastSyncedAt: "2025-04-01T12:00:00Z",
                })
                yield* fs.makeDirectory(path.join(directory, "images"), { recursive: true })
                const encoded = yield* Schema.encodeEffect(
                  Schema.fromJsonString(Schema.Unknown, { space: 2 }),
                )({ id, latest_source: record })
                yield* fs.writeFileString(
                  path.join(directory, "images", `${source.id}.json`),
                  encoded,
                )
              }
            }),
          { concurrency: 1 },
        )
      }),
    { concurrency: 1 },
  )
  yield* fs.makeDirectory(path.join(directory, "references"), { recursive: true })
  yield* fs.writeFileString(
    path.join(directory, "references", "index.json"),
    yield* Schema.encodeEffect(Schema.fromJsonString(Schema.Unknown, { space: 2 }))(references),
  )
})
