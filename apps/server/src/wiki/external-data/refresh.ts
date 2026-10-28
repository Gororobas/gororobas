import { WikiArticleId } from "@gororobas/domain"
import { Config, DateTime, Duration, Effect, Layer, Option, Schedule, Schema } from "effect"
import { SqlClient, SqlSchema } from "effect/sql"

import { findDatabaseRowById } from "../queries.js"
import { buildExternalDataRequest } from "./persist-utils.js"
import { FetchArticleExternalData } from "./workflow.js"

export const EXTERNAL_DATA_REFRESH_TIME = Duration.days(14)
export const EXTERNAL_DATA_RETRY_TIME = Duration.hours(1)

/** Limited to 25 at a time */
export const findArticlesDueForExternalData = SqlSchema.findAll({
  Request: Schema.Struct({
    refreshedBefore: Schema.DateTimeUtcFromString,
    retriedBefore: Schema.DateTimeUtcFromString,
  }),
  Result: Schema.Struct({ wikiArticleId: WikiArticleId, refreshGeneration: Schema.String }),
  execute: ({ refreshedBefore, retriedBefore }) =>
    SqlClient.SqlClient.use(
      (sql) => sql`
    SELECT article.id AS wiki_article_id,
      COALESCE(MAX(observation.id), 'initial') AS refresh_generation
    FROM wiki_article_projections article
    LEFT JOIN wiki_article_external_data_observations observation
      ON observation.wiki_article_id = article.id
      AND observation.article_crdt_frontier = article.current_crdt_frontier
    WHERE article.status = 'PUBLISHED' AND (
      (article.kind = 'PLANT' AND json_extract(article.attributes, '$.wikidataId') IS NOT NULL)
      OR (article.kind = 'BOOK' AND json_extract(article.attributes, '$.googleBooksVolumeId') IS NOT NULL)
    )
    GROUP BY article.id
    HAVING COUNT(observation.provider) = 0 OR EXISTS (
      SELECT 1 FROM wiki_article_external_data_observations latest
      WHERE latest.wiki_article_id = article.id
        AND latest.article_crdt_frontier = article.current_crdt_frontier
        AND NOT EXISTS (
          SELECT 1 FROM wiki_article_external_data_observations newer
          WHERE newer.wiki_article_id = latest.wiki_article_id AND newer.provider = latest.provider
            AND newer.article_crdt_frontier = latest.article_crdt_frontier
            AND (newer.observed_at > latest.observed_at
              OR (newer.observed_at = latest.observed_at AND newer.id > latest.id))
        )
        AND latest.observed_at < CASE WHEN json_extract(latest.outcome, '$._tag') = 'Failure'
          THEN ${retriedBefore} ELSE ${refreshedBefore} END
    )
    ORDER BY MAX(observation.observed_at), article.id
    LIMIT 25
  `,
    ),
})

export const refreshExternalData = Effect.gen(function* () {
  const refreshTime = yield* Config.Duration("EXTERNAL_DATA_REFRESH_TIME").pipe(
    Config.withDefault(EXTERNAL_DATA_REFRESH_TIME),
  )
  if (Duration.toMillis(refreshTime) <= 0) {
    return yield* Effect.die("External data refresh time must be positive")
  }
  const now = yield* DateTime.now
  const articles = yield* findArticlesDueForExternalData({
    refreshedBefore: DateTime.subtractDuration(now, refreshTime),
    retriedBefore: DateTime.subtractDuration(now, EXTERNAL_DATA_RETRY_TIME),
  })

  yield* Effect.forEach(
    articles,
    ({ wikiArticleId, refreshGeneration }) =>
      Effect.gen(function* () {
        const article = yield* findDatabaseRowById(wikiArticleId)
        if (Option.isNone(article)) return

        // An hourly generation also retries executions whose database persistence failed before an observation was saved.
        yield* FetchArticleExternalData.execute(
          {
            ...buildExternalDataRequest(article.value),
            refreshGeneration: `${refreshGeneration}:${DateTime.formatIso(now).slice(0, 13)}`,
          },
          { discard: true },
        )
      }).pipe(
        Effect.catchCause((cause) =>
          Effect.logWarning("External data refresh submission failed", cause),
        ),
      ),
    {
      concurrency: 1,
      discard: true,
    },
  )
}).pipe(Effect.withSpan("Wiki.refreshExternalData"))

export const ExternalDataRefreshLive = Layer.effectDiscard(
  refreshExternalData.pipe(
    Effect.catchCause((cause) => Effect.logWarning("External data refresh scan failed", cause)),
    Effect.repeat(Schedule.spaced("1 hour")),
    Effect.forkScoped,
  ),
)
