import {
  type ExternalDataFetchError,
  type ExternalDataFetchRequest,
  ExternalDataObservation,
  ExternalDataObservationId,
  type ExternalDataProvider,
  IdGen,
  type Observation,
} from "@gororobas/domain"
import { DateTime, Effect, Result, Schema, Struct } from "effect"
import { SqlClient, SqlSchema } from "effect/sql"

/**
 * Observations store their JSON columns through each schema's JSON codec, so an outcome reads
 * `{ "_tag": "Success", "success": [...] }` or `{ "_tag": "Failure", "failure": {...} }`. Queries
 * filtering with `json_extract` rely on that shape.
 */
export const StoredObservation = ExternalDataObservation.mapFields(
  Struct.assign({
    articleCrdtFrontier: Schema.fromJsonString(
      Schema.toCodecJson(ExternalDataObservation.fields.articleCrdtFrontier),
    ),
    inputs: Schema.fromJsonString(Schema.toCodecJson(ExternalDataObservation.fields.inputs)),
    outcome: Schema.fromJsonString(Schema.toCodecJson(ExternalDataObservation.fields.outcome)),
  }),
)

const insertObservation = SqlSchema.void({
  Request: StoredObservation,
  execute: (observation) =>
    SqlClient.SqlClient.use(
      (sql) =>
        sql`INSERT INTO wiki_article_external_data_observations ${sql.insert(observation)} ON CONFLICT DO NOTHING`,
    ),
})

/** Records what one provider returned for a fetch, whether it succeeded or not. */
export const recordProviderObservation = Effect.fn(function* ({
  request,
  provider,
  outcome,
}: {
  request: ExternalDataFetchRequest
  provider: typeof ExternalDataProvider.Type
  outcome: Result.Result<ReadonlyArray<Observation>, ExternalDataFetchError>
}) {
  yield* Result.match(outcome, {
    onSuccess: (observations) =>
      Effect.logInfo("External data observed", {
        provider,
        sources: observations.map((observation) => observation.sourceUrl),
      }),
    onFailure: (error) =>
      Effect.logWarning("External data fetch failed", {
        provider,
        message: error.message,
        retryable: error.retryable,
      }),
  })

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
