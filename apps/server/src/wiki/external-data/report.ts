import { ExternalDataProvider, WikiArticleId, WikiArticleKind } from "@gororobas/domain"
import { Array as EffectArray, Effect, Schema } from "effect"
import { SqlClient, SqlSchema } from "effect/sql"

/** What each provider's fetches for an article came to, from its observations. */
export const ProviderSummary = Schema.Struct({
  wikiArticleId: WikiArticleId,
  provider: ExternalDataProvider,
  observations: Schema.Int,
  failures: Schema.Int,
  lastObservedAt: Schema.String,
  lastOutcome: Schema.Literals(["Success", "Failure"]),
  lastError: Schema.NullOr(Schema.String),
})

export type ProviderSummary = typeof ProviderSummary.Type

/** Rows the latest successful fetches projected for an article. */
export const StoredExternalData = Schema.Struct({
  wikiArticleId: WikiArticleId,
  kind: WikiArticleKind,
  externalLinks: Schema.Int,
  externalMedia: Schema.Int,
  taxonomyGroup: Schema.NullOr(Schema.String),
  taxonomyClassification: Schema.Int,
  bookEditions: Schema.Int,
})

export type StoredExternalData = typeof StoredExternalData.Type

export const ExternalDataReport = Schema.Struct({
  ...StoredExternalData.fields,
  providers: Schema.Array(ProviderSummary),
})
export type ExternalDataReport = typeof ExternalDataReport.Type

const ArticleIds = Schema.Struct({ wikiArticleIds: Schema.Array(WikiArticleId) })

const findProviderSummaries = SqlSchema.findAll({
  Request: ArticleIds,
  Result: ProviderSummary,
  execute: ({ wikiArticleIds }) =>
    SqlClient.SqlClient.use(
      (sql) => sql`
        SELECT observation.wiki_article_id, observation.provider,
          COUNT(*) AS observations,
          SUM(json_extract(observation.outcome, '$._tag') = 'Failure') AS failures,
          latest.observed_at AS last_observed_at,
          json_extract(latest.outcome, '$._tag') AS last_outcome,
          json_extract(latest.outcome, '$.failure.message') AS last_error
        FROM wiki_article_external_data_observations observation
        JOIN wiki_article_external_data_observations latest ON latest.id = (
          SELECT newest.id FROM wiki_article_external_data_observations newest
          WHERE newest.wiki_article_id = observation.wiki_article_id
            AND newest.provider = observation.provider
          ORDER BY newest.observed_at DESC, newest.id DESC LIMIT 1
        )
        WHERE ${sql.in("observation.wiki_article_id", wikiArticleIds)}
        GROUP BY observation.wiki_article_id, observation.provider
        ORDER BY observation.wiki_article_id, observation.provider
      `,
    ),
})

const findStoredExternalData = SqlSchema.findAll({
  Request: ArticleIds,
  Result: StoredExternalData,
  execute: ({ wikiArticleIds }) =>
    SqlClient.SqlClient.use(
      (sql) => sql`
        SELECT article.id AS wiki_article_id, article.kind,
          (SELECT COUNT(*) FROM wiki_article_external_links link
            WHERE link.wiki_article_id = article.id) AS external_links,
          (SELECT COUNT(*) FROM wiki_article_external_media media
            WHERE media.wiki_article_id = article.id) AS external_media,
          (SELECT taxonomy_group FROM wiki_plant_taxonomy_group taxonomy
            WHERE taxonomy.wiki_article_id = article.id) AS taxonomy_group,
          (SELECT COUNT(*) FROM wiki_plant_taxonomy_classification classification
            WHERE classification.wiki_article_id = article.id) AS taxonomy_classification,
          (SELECT COUNT(*) FROM wiki_book_editions edition
            WHERE edition.wiki_article_id = article.id) AS book_editions
        FROM wiki_article_projections article
        WHERE ${sql.in("article.id", wikiArticleIds)}
        ORDER BY article.id
      `,
    ),
})

/** Per article: what's stored from providers, and how each provider's fetches went. */
export const reportExternalData = Effect.fn("ExternalData.report")(function* (
  wikiArticleIds: ReadonlyArray<WikiArticleId>,
) {
  if (!EffectArray.isReadonlyArrayNonEmpty(wikiArticleIds)) return []

  const stored = yield* findStoredExternalData({ wikiArticleIds })
  const providers = yield* findProviderSummaries({ wikiArticleIds })

  return stored.map((article): ExternalDataReport => ({
    ...article,
    providers: providers.filter((summary) => summary.wikiArticleId === article.wikiArticleId),
  }))
})
