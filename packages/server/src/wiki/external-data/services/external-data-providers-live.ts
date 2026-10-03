import { Layer } from "effect"
import { FetchHttpClient } from "effect/http"

import { GbifLive } from "./gbif.js"
import { GoogleBooksLive } from "./google-books.js"
import { WikidataLive } from "./wikidata.js"

export const ExternalDataProvidersLive = Layer.mergeAll(
  WikidataLive,
  GbifLive,
  GoogleBooksLive,
).pipe(Layer.provide(FetchHttpClient.layer))
