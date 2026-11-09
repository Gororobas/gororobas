import { Layer } from "effect"
import { FetchHttpClient } from "effect/http"

import { GbifLive } from "./gbif.js"
import { GoogleBooksLive } from "./google-books.js"
import { ProviderPhotoDownloaderLive } from "./provider-photo-downloader.js"
import { WikidataLive } from "./wikidata.js"

export const ExternalDataProvidersLive = Layer.mergeAll(
  WikidataLive,
  GbifLive,
  GoogleBooksLive,
  ProviderPhotoDownloaderLive,
).pipe(Layer.provide(FetchHttpClient.layer))
