import {
  BookEdition,
  type ExternalDataAttribution,
  ExternalDataObservationId,
  ExternalDataOutcomeTag,
  ExternalDataProvider,
  ExternalLink,
  type ExternalMediaAsset,
  GbifClassification,
  Handle,
  MediaAssetId,
  MediaAssetRow,
  Observation,
  WikiArticleId,
  WikiArticleKind,
  UrlAsString,
  type WikiArticleExternalData,
} from "@gororobas/domain"
import { Array as EffectArray, Effect, Match, Option, Schema } from "effect"
import { SqlClient, SqlSchema } from "effect/sql"

import { withMediaCredits } from "../../media-assets/credits.js"

const ArticleId = Schema.Struct({ wikiArticleId: WikiArticleId })

// ARTICLE PAGE

const findExternalLinks = SqlSchema.findAll({
  Request: ArticleId,
  Result: ExternalLink,
  execute: ({ wikiArticleId }) =>
    SqlClient.SqlClient.use(
      (sql) => sql`
        SELECT language, url FROM wiki_article_external_links
        WHERE wiki_article_id = ${wikiArticleId}
        ORDER BY language
      `,
    ),
})

const findTaxonomyGroup = SqlSchema.findOneOption({
  Request: ArticleId,
  Result: Schema.Struct({
    gbifTaxonId: Schema.String,
    taxonomyGroup: Schema.NullOr(Schema.String),
  }),
  execute: ({ wikiArticleId }) =>
    SqlClient.SqlClient.use(
      (sql) => sql`
        SELECT gbif_taxon_id, taxonomy_group FROM wiki_plant_taxonomy_group
        WHERE wiki_article_id = ${wikiArticleId}
      `,
    ),
})

const findClassification = SqlSchema.findAll({
  Request: ArticleId,
  Result: GbifClassification,
  execute: ({ wikiArticleId }) =>
    SqlClient.SqlClient.use(
      (sql) => sql`
        SELECT taxon_id, scientific_name, taxon_rank FROM wiki_plant_taxonomy_classification
        WHERE wiki_article_id = ${wikiArticleId}
      `,
    ),
})

const findExternalMediaAssets = SqlSchema.findAll({
  Request: ArticleId,
  Result: MediaAssetRow,
  execute: ({ wikiArticleId }) =>
    SqlClient.SqlClient.use(
      (sql) => sql`
        SELECT asset.* FROM wiki_article_external_media link
        JOIN media_assets asset ON asset.id = link.media_asset_id
        WHERE link.wiki_article_id = ${wikiArticleId} AND asset.moderation_status <> 'CENSORED'
        ORDER BY link.provider, link.order_index
      `,
    ),
})

const findExternalMediaOrigins = SqlSchema.findAll({
  Request: ArticleId,
  Result: Schema.Struct({
    mediaAssetId: MediaAssetId,
    provider: ExternalDataProvider,
    sourceUrl: UrlAsString,
  }),
  execute: ({ wikiArticleId }) =>
    SqlClient.SqlClient.use(
      (sql) => sql`
        SELECT link.media_asset_id, link.provider, origin.source_url
        FROM wiki_article_external_media link
        JOIN media_asset_imports origin ON origin.media_asset_id = link.media_asset_id
        WHERE link.wiki_article_id = ${wikiArticleId}
      `,
    ),
})

/** Providers' photos, with whom to credit for each and the provider's page for it. */
const findExternalMedia = Effect.fn(function* (request: typeof ArticleId.Type) {
  const assets = yield* findExternalMediaAssets(request)
  if (!EffectArray.isReadonlyArrayNonEmpty(assets)) return []

  const [credited, origins] = yield* Effect.all(
    [withMediaCredits(assets), findExternalMediaOrigins(request)],
    { concurrency: 1 },
  )

  return credited.flatMap((mediaAsset): ReadonlyArray<ExternalMediaAsset> =>
    EffectArray.fromOption(
      Option.map(
        EffectArray.findFirst(origins, (origin) => origin.mediaAssetId === mediaAsset.id),
        (origin) => ({ provider: origin.provider, sourceUrl: origin.sourceUrl, mediaAsset }),
      ),
    ),
  )
})

const findBookEditions = SqlSchema.findAll({
  Request: ArticleId,
  Result: Schema.Struct({
    ...BookEdition.fields,
    isbn: Schema.fromJsonString(BookEdition.fields.isbn),
    languages: Schema.fromJsonString(BookEdition.fields.languages),
  }),
  execute: ({ wikiArticleId }) =>
    SqlClient.SqlClient.use(
      (sql) => sql`
        SELECT edition.external_id, edition.title, edition.publisher, edition.publication_date,
          edition.page_count, edition.isbn, edition.source_url,
          COALESCE((
            SELECT json_group_array(language.language) FROM wiki_book_edition_languages language
            WHERE language.wiki_article_id = edition.wiki_article_id
              AND language.provider = edition.provider
              AND language.external_id = edition.external_id
          ), '[]') AS languages
        FROM wiki_book_editions edition
        WHERE edition.wiki_article_id = ${wikiArticleId}
        ORDER BY edition.publication_date DESC, edition.external_id
      `,
    ),
})

/** Each provider's latest successful observation: what the page's data came from. */
const findLatestSuccesses = SqlSchema.findAll({
  Request: ArticleId,
  Result: Schema.Struct({
    provider: ExternalDataProvider,
    observedAt: Schema.DateTimeUtcFromString,
    outcome: Schema.fromJsonString(Schema.Struct({ success: Schema.Array(Observation) })),
  }),
  execute: ({ wikiArticleId }) =>
    SqlClient.SqlClient.use(
      (sql) => sql`
        SELECT observation.provider, observation.observed_at, observation.outcome
        FROM wiki_article_external_data_observations observation
        WHERE observation.wiki_article_id = ${wikiArticleId}
          AND observation.id = (
            SELECT newest.id FROM wiki_article_external_data_observations newest
            WHERE newest.wiki_article_id = observation.wiki_article_id
              AND newest.provider = observation.provider
              AND json_extract(newest.outcome, '$._tag') = 'Success'
            ORDER BY newest.observed_at DESC, newest.id DESC LIMIT 1
          )
      `,
    ),
})

/** Catalogue of Life is the checklist GBIF matches taxa against, and has a page per taxon. */
const catalogueOfLifeUrl = (taxonId: string) =>
  `https://www.catalogueoflife.org/data/taxon/${encodeURIComponent(taxonId)}`

const wikidataUrl = (itemId: string) =>
  `https://www.wikidata.org/wiki/${encodeURIComponent(itemId)}`

/** What providers' latest successful fetches stored for an article, with credit to each. */
export const findExternalData = Effect.fn("ExternalData.findExternalData")(function* (
  wikiArticleId: WikiArticleId,
) {
  const request = { wikiArticleId }

  const { wikipediaLinks, maybeGroup, classification, media, bookEditions, successes } =
    yield* Effect.all(
      {
        wikipediaLinks: findExternalLinks(request),
        maybeGroup: findTaxonomyGroup(request),
        classification: findClassification(request),
        media: findExternalMedia(request),
        bookEditions: findBookEditions(request),
        successes: findLatestSuccesses(request),
      },
      { concurrency: 1 },
    )

  /** Credited only for data the page shows, at the provider's page for it. */
  const attributionUrl = (
    success: (typeof successes)[number],
  ): Option.Option<Pick<ExternalDataAttribution, "externalId" | "url">> =>
    Match.value(success.provider).pipe(
      Match.when("WIKIDATA", () =>
        Option.map(EffectArray.head(success.outcome.success), ({ externalId }) => ({
          externalId,
          url: wikidataUrl(externalId),
        })),
      ),
      Match.when("GBIF", () =>
        Option.map(maybeGroup, ({ gbifTaxonId }) => ({
          externalId: gbifTaxonId,
          url: catalogueOfLifeUrl(gbifTaxonId),
        })),
      ),
      Match.when("GOOGLE_BOOKS", () =>
        Option.map(EffectArray.head(bookEditions), ({ externalId, sourceUrl }) => ({
          externalId,
          url: sourceUrl,
        })),
      ),
      Match.exhaustive,
    )

  return {
    attributions: successes.flatMap((success) =>
      EffectArray.fromOption(
        Option.map(attributionUrl(success), (credit) => ({
          provider: success.provider,
          observedAt: success.observedAt,
          ...credit,
        })),
      ),
    ),
    wikipediaLinks,
    taxonomy: Option.match(maybeGroup, {
      onNone: () => null,
      onSome: ({ taxonomyGroup }) => ({ taxonomyGroup, classification }),
    }),
    media,
    bookEditions,
  } satisfies WikiArticleExternalData
})

// OBSERVATION LOG

export const ObservationRow = Schema.Struct({
  id: ExternalDataObservationId,
  provider: ExternalDataProvider,
  observedAt: Schema.DateTimeUtcFromString,
  inputs: Schema.fromJsonString(Schema.Json),
  outcome: Schema.fromJsonString(Schema.Json),
  wikiArticleId: WikiArticleId,
  kind: WikiArticleKind,
  handle: Handle,
  title: Schema.NullOr(Schema.String),
})

export type ObservationRow = typeof ObservationRow.Type

export const LogFilters = Schema.Struct({
  provider: Schema.NullOr(ExternalDataProvider),
  outcome: Schema.NullOr(ExternalDataOutcomeTag),
  wikiArticleId: Schema.NullOr(WikiArticleId),
})

const observationSelect = (sql: SqlClient.SqlClient) => sql`
  SELECT observation.id, observation.provider, observation.observed_at, observation.inputs,
    observation.outcome, observation.wiki_article_id, article.kind,
    (
      SELECT handle.handle FROM wiki_article_handles handle
      WHERE handle.wiki_article_id = observation.wiki_article_id
      ORDER BY handle.language = 'pt' DESC, handle.language LIMIT 1
    ) AS handle,
    (
      SELECT json_extract(translation.common_names, '$[0].name') FROM wiki_article_translations translation
      WHERE translation.wiki_article_id = observation.wiki_article_id
      ORDER BY translation.language = 'pt' DESC, translation.language LIMIT 1
    ) AS title
  FROM wiki_article_external_data_observations observation
  JOIN wiki_article_projections article ON article.id = observation.wiki_article_id
`

const filterConditions = (sql: SqlClient.SqlClient, filters: typeof LogFilters.Encoded) =>
  sql.and([
    ...(filters.provider === null ? [] : [sql`observation.provider = ${filters.provider}`]),
    ...(filters.outcome === null
      ? []
      : [sql`json_extract(observation.outcome, '$._tag') = ${filters.outcome}`]),
    ...(filters.wikiArticleId === null
      ? []
      : [sql`observation.wiki_article_id = ${filters.wikiArticleId}`]),
  ])

export const findObservationPage = SqlSchema.findAll({
  Request: Schema.Struct({ ...LogFilters.fields, limit: Schema.Int, offset: Schema.Int }),
  Result: ObservationRow,
  execute: ({ limit, offset, ...filters }) =>
    SqlClient.SqlClient.use(
      (sql) => sql`
        ${observationSelect(sql)}
        WHERE ${filterConditions(sql, filters)}
        ORDER BY observation.observed_at DESC, observation.id DESC
        LIMIT ${limit} OFFSET ${offset}
      `,
    ),
})

export const countObservations = SqlSchema.findOne({
  Request: LogFilters,
  Result: Schema.Struct({ total: Schema.Int }),
  execute: (filters) =>
    SqlClient.SqlClient.use(
      (sql) => sql`
        SELECT COUNT(*) AS total FROM wiki_article_external_data_observations observation
        WHERE ${filterConditions(sql, filters)}
      `,
    ),
})

export const findObservationById = SqlSchema.findOneOption({
  Request: Schema.Struct({ id: ExternalDataObservationId }),
  Result: ObservationRow,
  execute: ({ id }) =>
    SqlClient.SqlClient.use(
      (sql) => sql`
        ${observationSelect(sql)}
        WHERE observation.id = ${id}
      `,
    ),
})

export const findTallies = SqlSchema.findAll({
  Request: Schema.Void,
  Result: Schema.Struct({
    provider: ExternalDataProvider,
    successes: Schema.Int,
    failures: Schema.Int,
    articlesFailing: Schema.Int,
    lastObservedAt: Schema.NullOr(Schema.DateTimeUtcFromString),
  }),
  execute: () =>
    SqlClient.SqlClient.use(
      (sql) => sql`
        SELECT observation.provider,
          SUM(json_extract(observation.outcome, '$._tag') = 'Success') AS successes,
          SUM(json_extract(observation.outcome, '$._tag') = 'Failure') AS failures,
          (
            SELECT COUNT(*) FROM wiki_article_external_data_observations latest
            WHERE latest.provider = observation.provider
              AND json_extract(latest.outcome, '$._tag') = 'Failure'
              AND latest.id = (
                SELECT newest.id FROM wiki_article_external_data_observations newest
                WHERE newest.wiki_article_id = latest.wiki_article_id
                  AND newest.provider = latest.provider
                ORDER BY newest.observed_at DESC, newest.id DESC LIMIT 1
              )
          ) AS articles_failing,
          MAX(observation.observed_at) AS last_observed_at
        FROM wiki_article_external_data_observations observation
        GROUP BY observation.provider
        ORDER BY observation.provider
      `,
    ),
})
