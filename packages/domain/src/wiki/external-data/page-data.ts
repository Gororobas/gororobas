import { Schema } from "effect"

import { UrlAsString } from "../../common/primitives.js"
import {
  BookEdition,
  ExternalDataProvider,
  ExternalLink,
  ExternalMedia,
  GbifClassification,
} from "./common.js"

/** Credits a provider on an article's page, linking to where readers can check its data. */
export const ExternalDataAttribution = Schema.Struct({
  provider: ExternalDataProvider,
  /** The provider's identifier for what the article is about, such as a Wikidata item. */
  externalId: Schema.String,
  url: UrlAsString,
  observedAt: Schema.DateTimeUtcFromString,
})

export type ExternalDataAttribution = typeof ExternalDataAttribution.Type

export const ExternalTaxonomy = Schema.Struct({
  taxonomyGroup: Schema.NullOr(Schema.String),
  classification: Schema.Array(GbifClassification),
})

/**
 * What providers' latest successful fetches stored for an article. Every list is empty, and
 * taxonomy null, for what a kind doesn't fetch.
 */
export const WikiArticleExternalData = Schema.Struct({
  attributions: Schema.Array(ExternalDataAttribution),
  wikipediaLinks: Schema.Array(ExternalLink),
  taxonomy: Schema.NullOr(ExternalTaxonomy),
  media: Schema.Array(ExternalMedia),
  bookEditions: Schema.Array(BookEdition),
})

export type WikiArticleExternalData = typeof WikiArticleExternalData.Type
