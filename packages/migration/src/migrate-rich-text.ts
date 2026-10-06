import { IdGen, TiptapDocument, TiptapNode } from "@gororobas/domain"
import { Effect, FileSystem, Path, PlatformError, Predicate, Schema } from "effect"
import { KeyValueStore } from "effect/persistence"

import { GelTiptapDocument, GelTiptapNode } from "./schemas/gel/rich-text.js"
import {
  ensureMappedId,
  GelIdNotMappedError,
  MigrationContext,
} from "./services/migration-context.js"

const JsonObject = Schema.Record(Schema.String, Schema.Unknown)

const Mention = Schema.Struct({
  id: Schema.NonEmptyString,
  objectType: Schema.Literals([
    "UserProfile",
    "Note",
    "Vegetable",
    "Resource",
    "VegetableVariety",
    "Tag",
  ]),
})

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

export const migrateRichText = Effect.fn("migrateRichText")(function* (
  document: GelTiptapDocument,
) {
  const context = yield* MigrationContext

  const rewrite = (
    node: GelTiptapNode,
  ): Effect.Effect<
    TiptapNode,
    | Schema.SchemaError
    | GelIdNotMappedError
    | KeyValueStore.KeyValueStoreError
    | PlatformError.PlatformError,
    FileSystem.FileSystem | Path.Path | IdGen | MigrationContext
  > =>
    Effect.gen(function* () {
      const attrs = "attrs" in node ? node.attrs : undefined

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

          return yield* Schema.decodeUnknownEffect(TiptapNode)({
            type: "entityReference",
            attrs: {
              version: 1,
              referenceId: id,
              referenceType:
                entityType === "WikiArticle"
                  ? "WIKI_ARTICLE"
                  : entityType === "Profile"
                    ? "PROFILE"
                    : entityType === "Publication"
                      ? "PUBLICATION"
                      : entityType.toUpperCase(),
              labelAtInsertion: Predicate.isString(data.label) ? data.label : mention.id,
            },
          })
        } else {
          const image = yield* Schema.decodeUnknownEffect(JsonObject)(data.image)
          const reference = yield* Schema.decodeUnknownEffect(ImageReference)(image)
          const key = yield* Schema.decodeUnknownEffect(Schema.NonEmptyString)(
            reference.id ??
              (reference.sanity_id ? `image-sanity:${reference.sanity_id}` : undefined),
          )

          const id = yield* context.resolveId(key, "Image").pipe(
            Effect.catchTag("GelIdNotMappedError", () =>
              Effect.gen(function* () {
                const mediaAssetKey = reference.sanity_id
                  ? `image-sanity:${reference.sanity_id}`
                  : key

                const id = yield* context
                  .resolveId(mediaAssetKey, "Image")
                  .pipe(
                    Effect.catchTag("GelIdNotMappedError", () =>
                      ensureMappedId({ id: reference.sanity_id ? mediaAssetKey : key }, "Image"),
                    ),
                  )

                yield* context.registerMapping({
                  gelId: key,
                  sqliteId: id,
                  entityType: "Image",
                  contentHash: mediaAssetKey,
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

          return yield* Schema.decodeUnknownEffect(TiptapNode)({
            type: "mediaGrid",
            attrs: {
              version: 1,
              items: [
                {
                  source: "MEDIA_ASSET",
                  mediaAssetId: id,
                  format: "IMAGE",
                  ...(Predicate.isString(image.label) ? { alt: image.label } : {}),
                },
              ],
            },
          })
        }
      }

      if (node.type === "video") {
        const data = yield* Schema.decodeUnknownEffect(
          Schema.fromJsonString(Schema.Struct({ id: Schema.String })),
        )(attrs?.data)

        return yield* Schema.decodeUnknownEffect(TiptapNode)({
          type: "mediaGrid",
          attrs: {
            version: 1,
            items: [
              {
                source: "EXTERNAL_EMBED",
                version: 1,
                provider: "YOUTUBE",
                providerData: { videoId: data.id },
              },
            ],
          },
        })
      }

      const content =
        "content" in node && node.content
          ? yield* Effect.forEach(
              node.content.filter((child) => child.type !== "text" || child.text !== ""),
              rewrite,
              { concurrency: 1 },
            )
          : undefined

      return yield* Schema.decodeUnknownEffect(TiptapNode)({
        type: node.type,
        ...(node.text === undefined ? {} : { text: node.text }),
        ...(node.marks === undefined ? {} : { marks: node.marks }),
        ...(attrs ? { attrs } : {}),
        ...(content && content.length > 0 ? { content: mergeMediaGrids(content) } : {}),
      })
    })

  return yield* Schema.decodeUnknownEffect(TiptapDocument)({
    ...document,
    content: mergeMediaGrids(
      yield* Effect.forEach(
        document.content.filter((node) => node.type !== "text" || node.text !== ""),
        rewrite,
        { concurrency: 1 },
      ),
    ),
  })
})

/** Merge only adjacent sibling grids; text and nesting preserve their original boundaries. */
const mergeMediaGrids = (nodes: ReadonlyArray<TiptapNode>): ReadonlyArray<TiptapNode> => {
  const merged: TiptapNode[] = []

  for (const node of nodes) {
    const previous = merged[merged.length - 1]

    if (previous?.type === "mediaGrid" && node.type === "mediaGrid") {
      merged[merged.length - 1] = {
        type: "mediaGrid",
        attrs: { version: 1, items: [...previous.attrs.items, ...node.attrs.items] },
      }
    } else merged.push(node)
  }

  return merged
}
