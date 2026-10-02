import {
  LoroDocFrontier,
  WikiArticleId,
  type WikiArticleMaterializedRow,
  ExternalDataFetchError,
  ExternalDataFetchRequest,
  type ExternalDataResult,
} from "@gororobas/domain"
import { Effect, Layer, Match, Option, Schema } from "effect"
import { SqlClient } from "effect/unstable/sql"
import { Activity, Workflow } from "effect/unstable/workflow"

import { findDatabaseRowById } from "../queries.js"
import { fetchBook } from "./kinds/book-fetcher.js"
import { persistBook } from "./kinds/book-persister.js"
import { fetchPlant } from "./kinds/plant-fetcher.js"
import { persistPlant } from "./kinds/plant-persister.js"
import { buildExternalDataRequest } from "./persist-utils.js"

export const FetchArticleExternalData = Workflow.make("FetchArticleExternalData/v4", {
  payload: ExternalDataFetchRequest.fields,
  success: Schema.Void,
  error: ExternalDataFetchError,
  idempotencyKey: (request) =>
    `${request.wikiArticleId}:${Schema.encodeSync(Schema.fromJsonString(LoroDocFrontier))(request.articleCrdtFrontier)}`,
})

const runExternalDataFetch = Effect.fn(function* (request: ExternalDataFetchRequest) {
  const inputs = request.inputs

  if (inputs.kind === "NONE") return

  const data: ExternalDataResult = yield* Match.value(inputs).pipe(
    Match.discriminatorsExhaustive("kind")({
      PLANT: fetchPlant,
      BOOK: fetchBook,
    }),
  )

  yield* Activity.make({
    name: "persist-external-data",
    error: ExternalDataFetchError,
    execute: Match.value(data).pipe(
      Match.discriminatorsExhaustive("kind")({
        PLANT: (plant) => persistPlant(request, plant),
        BOOK: (book) => persistBook(request, book),
      }),
      Effect.mapError(
        () =>
          new ExternalDataFetchError({
            provider: "DATABASE",
            message: "ExternalData persistence failed",
            retryable: true,
          }),
      ),
    ),
  })
})

export const FetchArticleExternalDataLive = Layer.unwrap(
  Effect.gen(function* () {
    const applicationSql = yield* SqlClient.SqlClient

    // Cluster handlers carry the workflow storage SQL service; projections must use application SQL.
    return FetchArticleExternalData.toLayer((request) =>
      runExternalDataFetch(request).pipe(
        Effect.provideService(SqlClient.SqlClient, applicationSql),
      ),
    )
  }),
)

/**
 * Best-effort submission after the article transaction commits.
 * @todo refactor to receive the article directly w/o requerying from the DB. Given how we're calling it from the wiki's repository, this is the way to go.
 */
export const requestExternalDataFetch = Effect.fn(function* (
  wikiArticleId: WikiArticleId,
  previous?: WikiArticleMaterializedRow,
) {
  const article = yield* findDatabaseRowById(wikiArticleId)

  if (Option.isNone(article)) return

  const request = buildExternalDataRequest(article.value)

  if (request.inputs.kind === "NONE") return

  if (previous) {
    const oldRequest = buildExternalDataRequest(previous)

    // If the content change (new CRDT frontier), interrupt possibly ongoing workflow to avoid wasted work.
    if (
      !Schema.toEquivalence(LoroDocFrontier)(
        oldRequest.articleCrdtFrontier,
        request.articleCrdtFrontier,
      )
    ) {
      const executionId = yield* FetchArticleExternalData.executionId(oldRequest)
      yield* FetchArticleExternalData.interrupt(executionId)
    }
  }

  yield* FetchArticleExternalData.execute(request, { discard: true })
})
