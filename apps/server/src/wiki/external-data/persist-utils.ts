import {
  type WikiArticleEditableData,
  type WikiArticleProjectionRow,
  LoroDocFrontier,
  type ExternalDataFetchRequest,
  ExternalDataInputs,
  ExternalDataObservation,
  ExternalDataObservationId,
  IdGen,
  type ExternalDataProvider,
  type Observation,
  type ExternalDataFetchError,
} from "@gororobas/domain"
import { DateTime, Effect, Match, Option, type Result, Schema, Struct } from "effect"
import { SqlClient, SqlSchema } from "effect/sql"

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

export const clearProviderExternalData = Effect.fn(function* (
  wikiArticleId: string,
  provider: typeof ExternalDataProvider.Type,
) {
  const sql = yield* SqlClient.SqlClient

  // @todo refactor to use Effect Match
  if (provider === "WIKIDATA") {
    yield* sql`DELETE FROM wiki_article_external_links WHERE wiki_article_id = ${wikiArticleId}`
  } else if (provider === "GBIF") {
    yield* sql`DELETE FROM wiki_article_external_media WHERE wiki_article_id = ${wikiArticleId}`
    yield* sql`DELETE FROM wiki_plant_taxonomy_classification WHERE wiki_article_id = ${wikiArticleId}`
    yield* sql`DELETE FROM wiki_plant_taxonomy_group WHERE wiki_article_id = ${wikiArticleId}`
  } else if (provider === "GOOGLE_BOOKS") {
    yield* sql`DELETE FROM wiki_book_edition_languages WHERE wiki_article_id = ${wikiArticleId}`
    yield* sql`DELETE FROM wiki_book_editions WHERE wiki_article_id = ${wikiArticleId}`
  }
})

const insertObservation = SqlSchema.void({
  Request: ExternalDataObservation.mapFields(
    Struct.assign({
      articleCrdtFrontier: Schema.fromJsonString(
        ExternalDataObservation.fields.articleCrdtFrontier,
      ),
      inputs: Schema.fromJsonString(ExternalDataObservation.fields.inputs),
      outcome: Schema.fromJsonString(ExternalDataObservation.fields.outcome),
    }),
  ),
  execute: (observation) =>
    SqlClient.SqlClient.use(
      (sql) =>
        sql`INSERT INTO wiki_article_external_data_observations ${sql.insert(observation)} ON CONFLICT DO NOTHING`,
    ),
})

export const recordProviderObservation = Effect.fn(function* ({
  request,
  provider,
  outcome,
}: {
  request: ExternalDataFetchRequest
  provider: typeof ExternalDataProvider.Type
  outcome: Result.Result<ReadonlyArray<Observation>, ExternalDataFetchError>
}) {
  yield* insertObservation({
    // @todo  can the id of the observation be the idempotencyKey of its workflow + a date? Would this even be useful?
    id: yield* IdGen.make(ExternalDataObservationId),
    wikiArticleId: request.wikiArticleId,
    articleCrdtFrontier: request.articleCrdtFrontier,
    inputs: request.inputs,
    provider,
    observedAt: yield* DateTime.now,
    outcome,
  })
})

// Cluster interruption does not roll back activities already in flight.
export const persist = <E, R>(
  request: ExternalDataFetchRequest,
  project: Effect.Effect<void, E, R | SqlClient.SqlClient>,
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

      yield* project
    }).pipe(sql.withTransaction),
  )
