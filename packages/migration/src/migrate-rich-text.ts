import { IdGen, TiptapDocument, TiptapNode, TiptapTextNode } from "@gororobas/domain"
import { Effect, FileSystem, Path, PlatformError, Predicate, Schema } from "effect"
import { KeyValueStore } from "effect/unstable/persistence"

import {
  ensureMappedId,
  GelIdNotMappedError,
  MigrationContext,
} from "./services/migration-context.js"

const JsonObject = Schema.Record(Schema.String, Schema.Unknown)
const Mention = Schema.Struct({ id: Schema.String, objectType: Schema.String })
const ImageReference = Schema.Struct({
  id: Schema.optional(Schema.String),
  sanity_id: Schema.optional(Schema.String),
})

const saveEmbeddedReference = Effect.fn("saveEmbeddedReference")(function* (reference: {
  id: string
  gelId: string
  entityType: string
  collection: string
  label: string
  sanityId?: string
  sourceMissing: boolean
}) {
  const fs = yield* FileSystem.FileSystem
  const path = yield* Path.Path
  const directory = path.join(import.meta.dirname, "..", "debug", "references")
  yield* fs.makeDirectory(directory, { recursive: true })
  yield* fs.writeFileString(
    path.join(directory, `${reference.id}.json`),
    yield* Schema.encodeEffect(Schema.fromJsonString(Schema.Unknown))(reference),
  )
})

export const migrateRichText = Effect.fn("migrateRichText")(function* (document: TiptapDocument) {
  const context = yield* MigrationContext
  const rewrite = (
    node: TiptapNode | TiptapTextNode,
  ): Effect.Effect<
    TiptapNode,
    | Schema.SchemaError
    | GelIdNotMappedError
    | KeyValueStore.KeyValueStoreError
    | PlatformError.PlatformError,
    FileSystem.FileSystem | Path.Path | IdGen | MigrationContext
  > =>
    Effect.gen(function* () {
      let attrs = "attrs" in node ? node.attrs : undefined
      if ((node.type === "mention" || node.type === "image") && Predicate.isString(attrs?.data)) {
        const data = yield* Schema.decodeUnknownEffect(Schema.fromJsonString(JsonObject))(
          attrs.data,
        )
        if (node.type === "mention") {
          const mention = yield* Schema.decodeUnknownEffect(Mention)(data)
          const entityType =
            mention.objectType === "UserProfile"
              ? "Profile"
              : mention.objectType === "Note"
                ? "Publication"
                : mention.objectType === "Vegetable" ||
                    mention.objectType === "Resource" ||
                    mention.objectType === "VegetableVariety"
                  ? "WikiArticle"
                  : mention.objectType
          const id = yield* context.resolveId(mention.id, entityType).pipe(
            Effect.catchTag("GelIdNotMappedError", () =>
              Effect.gen(function* () {
                const id = yield* ensureMappedId({ id: mention.id }, entityType)
                yield* saveEmbeddedReference({
                  id,
                  gelId: mention.id,
                  entityType,
                  collection: entityType === "Profile" ? "profiles" : "missing",
                  label: Predicate.isString(data.label) ? data.label : mention.id,
                  sourceMissing: true,
                })
                return id
              }),
            ),
          )
          let image = data.image
          if (image !== undefined && image !== null) {
            const fields = yield* Schema.decodeUnknownEffect(JsonObject)(image)
            const reference = yield* Schema.decodeUnknownEffect(ImageReference)(fields)
            if (reference.sanity_id) {
              const key = `image-sanity:${reference.sanity_id}`
              const imageId = yield* context
                .resolveId(key, "Image")
                .pipe(
                  Effect.catchTag("GelIdNotMappedError", () =>
                    ensureMappedId({ id: key }, "Image"),
                  ),
                )
              yield* saveEmbeddedReference({
                id: imageId,
                gelId: key,
                entityType: "Image",
                collection: "images",
                label: reference.sanity_id,
                sanityId: reference.sanity_id,
                sourceMissing: false,
              })
              image = { ...fields, id: imageId }
            }
          }
          attrs = {
            ...attrs,
            data: yield* Schema.encodeEffect(Schema.fromJsonString(JsonObject))({
              ...data,
              ...(image === undefined ? {} : { image }),
              id,
              objectType: entityType,
            }),
          }
        } else {
          const image = yield* Schema.decodeUnknownEffect(JsonObject)(data.image)
          const reference = yield* Schema.decodeUnknownEffect(ImageReference)(image)
          const key = reference.id ?? `image-sanity:${reference.sanity_id}`
          const id = yield* context.resolveId(key, "Image").pipe(
            Effect.catchTag("GelIdNotMappedError", () =>
              Effect.gen(function* () {
                const assetKey = `image-sanity:${reference.sanity_id}`
                const id = yield* context
                  .resolveId(assetKey, "Image")
                  .pipe(
                    Effect.catchTag("GelIdNotMappedError", () =>
                      ensureMappedId({ id: reference.sanity_id ? assetKey : key }, "Image"),
                    ),
                  )
                yield* context.registerMapping({
                  gelId: key,
                  sqliteId: id,
                  entityType: "Image",
                  contentHash: assetKey,
                  lastSyncedAt: "2025-04-01T12:00:00Z",
                })
                yield* saveEmbeddedReference({
                  id,
                  gelId: key,
                  entityType: "Image",
                  collection: "images",
                  label: Predicate.isString(image.label)
                    ? image.label
                    : (reference.sanity_id ?? key),
                  ...(reference.sanity_id ? { sanityId: reference.sanity_id } : {}),
                  sourceMissing: true,
                })
                return id
              }),
            ),
          )
          attrs = {
            ...attrs,
            data: yield* Schema.encodeEffect(Schema.fromJsonString(JsonObject))({
              ...data,
              image: { ...image, id },
            }),
          }
        }
      }
      const content =
        "content" in node && node.content
          ? yield* Effect.forEach(node.content, rewrite, { concurrency: 1 })
          : undefined
      return TiptapNode.make({
        type: node.type,
        ...(node.text === undefined ? {} : { text: node.text }),
        ...(node.marks === undefined ? {} : { marks: node.marks }),
        ...(attrs ? { attrs } : {}),
        ...(content ? { content } : {}),
      })
    })
  return TiptapDocument.make({
    ...document,
    content: yield* Effect.forEach(document.content, rewrite, { concurrency: 1 }),
  })
})
