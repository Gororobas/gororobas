import { type ExternalDataFetchRequest, type BookExternalDataResult } from "@gororobas/domain"
import { Effect, Result, Schema } from "effect"
import { SqlClient, SqlSchema } from "effect/unstable/sql"

import { persist } from "../persist-utils.js"

// @todo refactor to improve schema reusability
const insertEdition = SqlSchema.void({
  Request: Schema.Struct({
    wikiArticleId: Schema.String,
    provider: Schema.Literals(["OPEN_LIBRARY", "GOOGLE_BOOKS"]),
    externalId: Schema.String,
    title: Schema.String,
    publisher: Schema.NullOr(Schema.String),
    publicationDate: Schema.NullOr(Schema.String),
    pageCount: Schema.NullOr(Schema.Int),
    isbn: Schema.String,
    sourceUrl: Schema.String,
  }),
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
    wikiArticleId: Schema.String,
    provider: Schema.Literals(["OPEN_LIBRARY", "GOOGLE_BOOKS"]),
    externalId: Schema.String,
    language: Schema.String,
  }),
  execute: (language) =>
    Effect.gen(function* () {
      const sql = yield* SqlClient.SqlClient
      return yield* sql`INSERT INTO wiki_book_edition_languages ${sql.insert(language)} ON CONFLICT DO NOTHING`
    }),
})

// @todo refactor to reduce identation
export const persistBook = (request: ExternalDataFetchRequest, data: BookExternalDataResult) =>
  persist(
    request,
    Effect.gen(function* () {
      const wikiArticleId = request.wikiArticleId
      const providers = [
        { provider: "OPEN_LIBRARY", result: data.attributes.openLibrary },
        { provider: "GOOGLE_BOOKS", result: data.attributes.googleBooks },
      ] as const

      yield* Effect.forEach(
        providers,
        ({ provider, result }) =>
          Effect.gen(function* () {
            if (result === null || Result.isFailure(result)) return

            yield* Effect.forEach(
              result.success.editions,
              (edition) =>
                Effect.gen(function* () {
                  const { languages, isbn: identifiers, ...attributes } = edition
                  const isbn = yield* Schema.encodeEffect(
                    Schema.fromJsonString(Schema.Array(Schema.String)),
                  )(identifiers)
                  yield* insertEdition({ wikiArticleId, provider, ...attributes, isbn })
                  yield* Effect.forEach(
                    languages,
                    (language) =>
                      insertEditionLanguage({
                        wikiArticleId,
                        provider,
                        externalId: edition.externalId,
                        language,
                      }),
                    { discard: true, concurrency: 1 },
                  )
                }),
              { discard: true, concurrency: 1 },
            )
          }),
        { discard: true, concurrency: 1 },
      )
    }),
  )
