import {
  SessionContext,
  UnauthorizedError,
  WikiArticleCrdt,
  WikiArticleEditableData,
  type WikiArticleId,
  WikiArticleNotFoundError,
  snapshotToLoroDoc,
} from "@gororobas/domain"
import { Array as EffectArray, Effect, Option, Predicate, Record, Schema } from "effect"
import { SqlClient } from "effect/sql"

import { environmentConfig } from "../environment-config.js"
import { findSourceRowById } from "./queries.js"

const jsonColumns: ReadonlyArray<string> = [
  "attributes",
  "currentCrdtFrontier",
  "fromCrdtFrontier",
  "commonNames",
  "content",
  "languages",
  "descriptions",
  "articleCrdtFrontier",
  "inputs",
  "outcome",
  "isbn",
]

const StoredDebugRow = Schema.Record(Schema.String, Schema.Union([Schema.Uint8Array, Schema.Json]))

const normalizeRows = Effect.fn(function* (rows: ReadonlyArray<unknown>) {
  // oxlint-disable-next-line custom-lint-rules/no-schema-decode-unknown -- Raw SQLite rows contain JSON columns and binary CRDT updates.
  const decoded = yield* Schema.decodeUnknownEffect(Schema.Array(StoredDebugRow))(rows)

  return yield* Effect.forEach(
    decoded,
    (row) =>
      Effect.gen(function* () {
        const entries = yield* Effect.forEach(
          Record.toEntries(row),
          ([key, value]) =>
            Effect.gen(function* () {
              const normalized =
                value instanceof Uint8Array
                  ? EffectArray.fromIterable(value)
                  : jsonColumns.includes(key) && Predicate.isString(value)
                    ? yield* Schema.decodeEffect(Schema.fromJsonString(Schema.Json))(value)
                    : value

              return [key, normalized] as const
            }),
          { concurrency: 1 },
        )

        return Record.fromEntries(entries)
      }),
    { concurrency: 1 },
  )
})

// This development view includes pending revisions and bookmarks, so it must not be exposed in production.
export const getWikiArticleDebug = Effect.fn("Wiki.getArticleDebug")(function* (
  wikiArticleId: WikiArticleId,
) {
  if ((yield* environmentConfig.pipe(Effect.orDie)) === "production") {
    return yield* new UnauthorizedError({
      session: yield* SessionContext,
      message: "Article debugging is development-only",
    })
  }

  const stored = yield* findSourceRowById(wikiArticleId)
  if (Option.isNone(stored)) return yield* new WikiArticleNotFoundError({ id: wikiArticleId })
  const sql = yield* SqlClient.SqlClient
  const canonical = yield* WikiArticleCrdt.read(snapshotToLoroDoc(stored.value.crdtSnapshot))

  const data = {
    canonical: yield* Schema.encodeEffect(WikiArticleEditableData)(canonical),
    projection: yield* sql`SELECT * FROM wiki_article_projections WHERE id = ${wikiArticleId}`,
    translations:
      yield* sql`SELECT * FROM wiki_article_translations WHERE wiki_article_id = ${wikiArticleId}`,
    handles:
      yield* sql`SELECT * FROM wiki_article_handles WHERE wiki_article_id = ${wikiArticleId}`,
    crdt: {
      id: stored.value.id,
      status: stored.value.status,
      snapshotBytes: stored.value.crdtSnapshot.length,
    },
    revisions:
      yield* sql`SELECT * FROM wiki_article_revisions WHERE wiki_article_id = ${wikiArticleId} ORDER BY created_at DESC`,
    media:
      yield* sql`SELECT attachment.*, asset.* FROM wiki_article_media_assets attachment JOIN media_assets asset ON asset.id = attachment.media_asset_id WHERE attachment.wiki_article_id = ${wikiArticleId}`,
    revisionMedia:
      yield* sql`SELECT selection.* FROM wiki_article_revision_media_assets selection JOIN wiki_article_revisions revision ON revision.id = selection.wiki_article_revision_id WHERE revision.wiki_article_id = ${wikiArticleId}`,
    mainMedia:
      yield* sql`SELECT * FROM wiki_article_main_media WHERE wiki_article_id = ${wikiArticleId}`,
    externalLinks:
      yield* sql`SELECT * FROM wiki_article_external_links WHERE wiki_article_id = ${wikiArticleId}`,
    externalMedia:
      yield* sql`SELECT * FROM wiki_article_external_media WHERE wiki_article_id = ${wikiArticleId}`,
    taxonomyGroup:
      yield* sql`SELECT * FROM wiki_plant_taxonomy_group WHERE wiki_article_id = ${wikiArticleId}`,
    taxonomyClassification:
      yield* sql`SELECT * FROM wiki_plant_taxonomy_classification WHERE wiki_article_id = ${wikiArticleId}`,
    bookEditions:
      yield* sql`SELECT * FROM wiki_book_editions WHERE wiki_article_id = ${wikiArticleId}`,
    bookEditionLanguages:
      yield* sql`SELECT * FROM wiki_book_edition_languages WHERE wiki_article_id = ${wikiArticleId}`,
    externalDataObservations:
      yield* sql`SELECT * FROM wiki_article_external_data_observations WHERE wiki_article_id = ${wikiArticleId} ORDER BY observed_at DESC`,
    bookmarks:
      yield* sql`SELECT * FROM bookmarks_wiki_articles WHERE wiki_article_id = ${wikiArticleId}`,
    publicationReferences:
      yield* sql`SELECT * FROM publication_wiki_articles WHERE wiki_article_id = ${wikiArticleId}`,
    cultivars:
      yield* sql`SELECT * FROM wiki_article_projections WHERE kind = 'PLANT_CULTIVAR' AND json_extract(attributes, '$.parentPlantId') = ${wikiArticleId}`,
  }

  const sections = yield* Effect.forEach(
    Record.toEntries(data),
    ([name, value]) =>
      Effect.gen(function* () {
        const normalized = EffectArray.isArray(value) ? yield* normalizeRows(value) : value
        return [name, normalized] as const
      }),
    { concurrency: 1 },
  )

  const json = yield* Schema.encodeEffect(Schema.fromJsonString(Schema.Unknown))(
    Record.fromEntries(sections),
  )

  return yield* Schema.decodeEffect(
    Schema.fromJsonString(Schema.Record(Schema.String, Schema.Json)),
  )(json)
})
