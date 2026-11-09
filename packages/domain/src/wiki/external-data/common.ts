import { Schema } from "effect"

import { UrlAsString } from "../../common/primitives.js"

export const ExternalDataProvider = Schema.Literals(["WIKIDATA", "GBIF", "GOOGLE_BOOKS"])

/**
 * A photo a provider lists for what an article is about, before it's imported into our media
 * assets. Only photos with a license are listed.
 */
export const ProviderPhoto = Schema.Struct({
  /** The image file, such as an iNaturalist photo GBIF links to. Imports are unique per URL. */
  mediaUrl: UrlAsString,
  /** The provider's page for the photo, such as a GBIF occurrence. */
  sourceUrl: UrlAsString,
  /** Whom to credit, in order: its authors, or else whoever published it. */
  credits: Schema.Array(Schema.String),
  licenseUrl: UrlAsString,
})

export type ProviderPhoto = typeof ProviderPhoto.Type

export const Observation = Schema.Struct({
  provider: ExternalDataProvider,
  externalId: Schema.String,
  sourceUrl: UrlAsString,
  fetchedAt: Schema.String,
  payload: Schema.Json,
})

export type Observation = typeof Observation.Type

export const ExternalLink = Schema.Struct({ language: Schema.String, url: UrlAsString })
export type ExternalLink = typeof ExternalLink.Type
