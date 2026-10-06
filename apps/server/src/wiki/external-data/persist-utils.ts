import {
  type WikiArticleEditableData,
  type WikiArticleProjectionRow,
  LoroDocFrontier,
  type ExternalDataFetchRequest,
  ExternalDataInputs,
} from "@gororobas/domain"
import { Effect, Match, Option, Schema } from "effect"
import { SqlClient } from "effect/sql"

import { findDatabaseRowById } from "../queries.js"
import { bookToExternalDataInputs } from "./kinds/book-fetcher.js"
import { plantToExternalDataInputs } from "./kinds/plant-fetcher.js"

export const articleToExternalDataInputs = (
  article: WikiArticleEditableData | WikiArticleProjectionRow,
): ExternalDataInputs =>
  Match.value(article).pipe(
    Match.when({ kind: "PLANT" }, plantToExternalDataInputs),
    Match.when({ kind: "BOOK" }, bookToExternalDataInputs),
    Match.orElse(() => ({ kind: "NONE" as const })),
  )

export type ExternalDataArticle = (WikiArticleEditableData | WikiArticleProjectionRow) &
  Pick<WikiArticleProjectionRow, "id" | "currentCrdtFrontier">

export const buildExternalDataRequest = (
  article: ExternalDataArticle,
): ExternalDataFetchRequest => ({
  wikiArticleId: article.id,
  articleCrdtFrontier: article.currentCrdtFrontier,
  inputs: articleToExternalDataInputs(article),
})

export const clearArticleExternalData = Effect.fn(function* (wikiArticleId: string) {
  const sql = yield* SqlClient.SqlClient
  yield* sql`DELETE FROM wiki_article_external_links WHERE wiki_article_id = ${wikiArticleId}`
  yield* sql`DELETE FROM wiki_article_external_media WHERE wiki_article_id = ${wikiArticleId}`
  yield* sql`DELETE FROM wiki_plant_taxonomy_classification WHERE wiki_article_id = ${wikiArticleId}`
  yield* sql`DELETE FROM wiki_plant_taxonomy_group WHERE wiki_article_id = ${wikiArticleId}`
  yield* sql`DELETE FROM wiki_book_edition_languages WHERE wiki_article_id = ${wikiArticleId}`
  yield* sql`DELETE FROM wiki_book_editions WHERE wiki_article_id = ${wikiArticleId}`
})

// Cluster interruption does not roll back activities already in flight.
export const persist = <E>(
  request: ExternalDataFetchRequest,
  project: Effect.Effect<void, E, SqlClient.SqlClient>,
) =>
  SqlClient.SqlClient.use((sql) =>
    Effect.gen(function* () {
      const article = yield* findDatabaseRowById(request.wikiArticleId)
      if (Option.isNone(article)) return

      const current = buildExternalDataRequest(article.value)

      if (
        !Schema.toEquivalence(LoroDocFrontier)(
          current.articleCrdtFrontier,
          request.articleCrdtFrontier,
        )
      ) {
        return
      }

      yield* clearArticleExternalData(request.wikiArticleId)
      yield* project
    }).pipe(sql.withTransaction),
  )
