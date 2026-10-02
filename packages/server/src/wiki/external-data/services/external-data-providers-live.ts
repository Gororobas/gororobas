import { Layer } from "effect"
import { FetchHttpClient } from "effect/unstable/http"

import { GbifLive } from "./gbif.js"
import { GoogleBooksLive } from "./google-books.js"
import { OpenLibraryLive } from "./open-library.js"
import { WikidataLive } from "./wikidata.js"

export const ExternalDataProvidersLive = Layer.mergeAll(
  WikidataLive,
  GbifLive,
  OpenLibraryLive,
  GoogleBooksLive,
).pipe(Layer.provide(FetchHttpClient.layer))
