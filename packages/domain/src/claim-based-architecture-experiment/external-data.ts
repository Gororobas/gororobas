import { GoogleBooksVolumeIdProperty } from "./properties/google-books-volume-id.js"
import type { Property } from "./properties/index.js"
import { IsbnProperty } from "./properties/isbn.js"
import { WikidataIdProperty } from "./properties/wikidata-id.js"
import type { FetchedProvider } from "./providers.js"

/**
 * Which identifiers each provider is fetched by: a change to one of their resolved values requests
 * a fetch, replacing `startExternalDataFetch` per property. Fetches only read identifiers from
 * people and the gazetteer; otherwise Google Books asserting an
 * ISBN would request a fetch by that ISBN, and so on.
 *
 * After a fetch, every property listing the provider among its sources extracts its claims from
 * the result, replacing that provider's previous claims about the article.
 */
export const providerInputs = {
  GOOGLE_BOOKS: [GoogleBooksVolumeIdProperty, IsbnProperty],
  WIKIDATA: [WikidataIdProperty],
  GBIF: [WikidataIdProperty],
} as const satisfies { readonly [P in FetchedProvider]: ReadonlyArray<Property> }
