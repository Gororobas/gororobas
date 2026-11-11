import { Layer } from "effect"
import { FetchHttpClient } from "effect/http"

import { GbifLive } from "./gbif.js"
import { GoogleBooksLive } from "./google-books.js"
import { ProviderPhotoDownloaderLive } from "./provider-photo-downloader.js"
import { TmdbLive } from "./tmdb.js"
import { WikidataLive } from "./wikidata.js"

export const ExternalDataProvidersLive = Layer.mergeAll(
  WikidataLive,
  GbifLive,
  GoogleBooksLive,
  TmdbLive,
  ProviderPhotoDownloaderLive,
).pipe(Layer.provide(FetchHttpClient.layer))
