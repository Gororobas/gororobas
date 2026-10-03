import {
  PersonId,
  LoroDocSnapshot,
  LoroDocUpdate,
  WikiArticleEditableData,
  WikiArticleId,
  PublicationId,
  PublicationSourceData,
  PublicationSourceDataStorage,
  publicationSourceDataStorageToSourcePublicationData,
  parseWikiArticleCrdtUpdate,
  loroDocToSnapshot,
  loroDocToUpdate,
  snapshotToLoroDoc,
} from "@gororobas/domain"
import {
  findPublicationCrdtSnapshotById,
  findPublicationRowById,
} from "@gororobas/server/publications/queries"
import {
  findCrdtRowById,
  findDatabaseRowById,
  findTranslationRows,
} from "@gororobas/server/wiki/queries"
import { Effect, FileSystem, Option, Schema } from "effect"
import { SqlClient, SqlSchema } from "effect/sql"
import { diff } from "json-diff-ts"
import { LoroDoc } from "loro-crdt"
import { join } from "node:path"

import { PreviewExports } from "./preview-exports.js"

const Revision = Schema.Struct({
  crdtUpdate: LoroDocUpdate,
  createdAt: Schema.String,
  createdById: Schema.NullOr(PersonId),
  evaluatedById: Schema.NullOr(PersonId),
})
const Photo = Schema.Struct({ mediaAssetId: Schema.String })
const StoredMediaAsset = Schema.Struct({ id: Schema.String })

/** JSON provides provenance; contributor data and relations are read back from the server tables. */
export const readPreviewDataset = (directory: string) =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem
    const sql = yield* SqlClient.SqlClient
    // Only completed imports may be served.
    yield* fs.readFileString(join(directory, "verification.json"))
    const exports = yield* fs
      .readFileString(join(directory, "converted.json"))
      .pipe(Effect.flatMap(Schema.decodeUnknownEffect(Schema.fromJsonString(PreviewExports))))
    const references = yield* fs
      .readFileString(join(directory, "references.json"))
      .pipe(
        Effect.flatMap(
          Schema.decodeUnknownEffect(Schema.fromJsonString(Schema.Array(Schema.Json))),
        ),
      )
    const dataset: Record<string, Array<Record<string, unknown>>> = {}
    for (const category of ["plants", "resources", "cultivars"] as const) {
      dataset[category] = yield* Effect.forEach(
        exports[category],
        ({ file, data }) =>
          Effect.gen(function* () {
            const id = yield* Schema.decodeUnknownEffect(WikiArticleId)(data.id)
            const crdt = yield* findCrdtRowById(id).pipe(Effect.map(Option.getOrThrow))
            const row = yield* findDatabaseRowById(id).pipe(Effect.map(Option.getOrThrow))
            const translations = yield* findTranslationRows(id)
            const article = yield* parseWikiArticleCrdtUpdate({
              snapshot: crdt.crdtSnapshot,
              crdtUpdate: LoroDocUpdate.make(loroDocToUpdate(snapshotToLoroDoc(crdt.crdtSnapshot))),
            })
            const revisions = yield* SqlSchema.findAll({
              Request: WikiArticleId,
              Result: Revision,
              execute: (id) =>
                sql`SELECT crdt_update, created_at, created_by_id, evaluated_by_id FROM wiki_article_revisions WHERE wiki_article_id = ${id} AND evaluation = 'APPROVED' ORDER BY created_at, rowid`,
            })(id)
            const photos = yield* SqlSchema.findAll({
              Request: WikiArticleId,
              Result: Photo,
              execute: (id) =>
                sql`SELECT media_asset_id FROM wiki_article_photos WHERE wiki_article_id = ${id} ORDER BY order_index`,
            })(id)
            const document = new LoroDoc()
            const versions = []
            const provenance = Array.isArray(data.versions) ? data.versions : []
            let previous: unknown = {}
            for (const [index, revision] of revisions.entries()) {
              const from = document.frontiers()
              document.import(revision.crdtUpdate)
              const snapshot = LoroDocSnapshot.make(loroDocToSnapshot(document))
              const parsed = yield* parseWikiArticleCrdtUpdate({
                snapshot,
                crdtUpdate: LoroDocUpdate.make(loroDocToUpdate(document)),
              })
              const original = provenance[index]
              const encoded = yield* Schema.encodeEffect(WikiArticleEditableData)(parsed.data)
              versions.push({
                ...(original && typeof original === "object" ? original : {}),
                article: encoded,
                actorId: revision.createdById,
                reviewerId: revision.evaluatedById,
                changes: diff(previous, encoded),
                loroDiff: document.diff(from, document.frontiers(), true),
                timestamp: revision.createdAt,
                frontier: document.frontiers(),
                loroSnapshot: Buffer.from(snapshot).toString("base64"),
              })
              previous = encoded
            }
            return {
              ...data,
              file,
              article: yield* Schema.encodeEffect(WikiArticleEditableData)(article.data),
              versions,
              photoIds: photos.map((photo) => photo.mediaAssetId),
              thumbnailId: photos[0]?.mediaAssetId ?? null,
              persisted: { article: row, translations },
            }
          }),
        { concurrency: 1 },
      )
    }
    dataset.notes = yield* Effect.forEach(
      exports.notes,
      ({ file, data }) =>
        Effect.gen(function* () {
          const id = yield* Schema.decodeUnknownEffect(PublicationId)(data.id)
          const crdt = yield* findPublicationCrdtSnapshotById(id).pipe(
            Effect.map(Option.getOrThrow),
          )
          const row = yield* findPublicationRowById(id).pipe(Effect.map(Option.getOrThrow))
          const storage = yield* Schema.decodeUnknownEffect(PublicationSourceDataStorage)(
            snapshotToLoroDoc(crdt.crdtSnapshot).toJSON(),
          )
          const publication = publicationSourceDataStorageToSourcePublicationData(storage)
          const tags = yield* SqlSchema.findAll({
            Request: PublicationId,
            Result: Schema.Struct({ tagId: Schema.String }),
            execute: (id) => sql`SELECT tag_id FROM publication_tags WHERE publication_id = ${id}`,
          })(id)
          const articles = yield* SqlSchema.findAll({
            Request: PublicationId,
            Result: Schema.Struct({ wikiArticleId: Schema.String }),
            execute: (id) =>
              sql`SELECT wiki_article_id FROM publication_wiki_articles WHERE publication_id = ${id}`,
          })(id)
          return {
            ...data,
            file,
            publication: yield* Schema.encodeEffect(PublicationSourceData)(publication),
            tagIds: tags.map((tag) => tag.tagId),
            wikiArticleIds: articles.map((article) => article.wikiArticleId),
            persisted: row,
          }
        }),
      { concurrency: 1 },
    )
    const tags = yield* sql`SELECT * FROM tags`
    dataset.tags = exports.tags.map(({ file, data }) => ({
      ...data,
      file,
      persisted: tags.find((tag) => tag.id === data.id),
    }))
    const localMediaAssets = yield* SqlSchema.findAll({
      Request: Schema.Void,
      Result: StoredMediaAsset,
      execute: () => sql`SELECT id FROM media_assets WHERE storage_key IS NOT NULL`,
    })(undefined)
    return {
      plants: dataset.plants,
      resources: dataset.resources,
      cultivars: dataset.cultivars,
      notes: dataset.notes,
      tags: dataset.tags,
      references,
      rejected: [],
      missing: [],
      localMediaAssets,
      database: join(directory, "preview.sqlite"),
    }
  })
