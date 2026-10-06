import {
  BookEdition,
  WikiArticleId,
  type ExternalDataFetchRequest,
  type BookExternalDataResult,
} from "@gororobas/domain"
import { Effect, Result, Schema, Struct } from "effect"
import { SqlClient, SqlSchema } from "effect/sql"

import { persist } from "../persist-utils.js"

const insertEdition = SqlSchema.void({
  Request: BookEdition.mapFields(Struct.omit(["languages"])).mapFields(
    Struct.assign({
      wikiArticleId: WikiArticleId,
      provider: Schema.Literal("GOOGLE_BOOKS"),
      isbn: Schema.fromJsonString(BookEdition.fields.isbn),
    }),
  ),
  execute: (edition) =>
    Effect.gen(function* () {
      const sql = yield* SqlClient.SqlClient

      return yield* sql`
        INSERT INTO wiki_book_editions ${sql.insert(edition)}
        ON CONFLICT (wiki_article_id, provider, external_id) DO UPDATE SET title = excluded.title,
          publisher = excluded.publisher, publication_date = excluded.publication_date,
          page_count = excluded.page_count, isbn = excluded.isbn, source_url = excluded.source_url
      `
    }),
})

const insertEditionLanguage = SqlSchema.void({
  Request: Schema.Struct({
    wikiArticleId: WikiArticleId,
    provider: Schema.Literal("GOOGLE_BOOKS"),
    externalId: BookEdition.fields.externalId,
    language: BookEdition.fields.languages.value,
  }),
  execute: (language) =>
    Effect.gen(function* () {
      const sql = yield* SqlClient.SqlClient
      return yield* sql`INSERT INTO wiki_book_edition_languages ${sql.insert(language)} ON CONFLICT DO NOTHING`
    }),
})

const persistEditions = Effect.fn(function* (
  wikiArticleId: WikiArticleId,
  result: BookExternalDataResult["attributes"]["googleBooks"],
) {
  if (result === null || Result.isFailure(result)) return

  yield* Effect.forEach(
    result.success.editions,
    (edition) =>
      Effect.gen(function* () {
        const { languages, ...attributes } = edition
        yield* insertEdition({ wikiArticleId, provider: "GOOGLE_BOOKS", ...attributes })

        yield* Effect.forEach(
          languages,
          (language) =>
            insertEditionLanguage({
              wikiArticleId,
              provider: "GOOGLE_BOOKS",
              externalId: edition.externalId,
              language,
            }),
          { discard: true, concurrency: 1 },
        )
      }),
    { discard: true, concurrency: 1 },
  )
})

export const persistBook = (request: ExternalDataFetchRequest, data: BookExternalDataResult) =>
  persist(request, persistEditions(request.wikiArticleId, data.attributes.googleBooks))
