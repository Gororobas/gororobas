import type { ExternalDataProvider, MediaAssetId, ProviderPhoto } from "@gororobas/domain"
import { Array as EffectArray, Effect, Option } from "effect"

import { MediaAssetsRepository } from "../../media-assets/repository.js"
import { MediaAssetsService } from "../../media-assets/service.js"
import { ProviderPhotoDownloader } from "./services/provider-photo-downloader.js"

/**
 * Enough for an article's gallery. Each import is downloaded and converted to every image size,
 * so this bounds how long a fetch takes and how much storage an article uses.
 */
export const MAX_IMPORTED_PHOTOS_PER_ARTICLE = 12

/** The photo's media asset, importing it unless an earlier fetch already did. */
const importPhoto = Effect.fn("ExternalData.importPhoto")(function* (
  provider: typeof ExternalDataProvider.Type,
  photo: ProviderPhoto,
) {
  const repository = yield* MediaAssetsRepository
  const existing = yield* repository.findMediaAssetImportByUrl(photo.mediaUrl)
  if (Option.isSome(existing)) return existing.value.mediaAssetId

  const file = yield* (yield* ProviderPhotoDownloader).download(photo.mediaUrl)

  const media = yield* (yield* MediaAssetsService).importFromProvider({
    file,
    origin: { provider, mediaUrl: photo.mediaUrl, sourceUrl: photo.sourceUrl },
    credits: photo.credits,
    licenseUrl: photo.licenseUrl,
  })

  yield* Effect.logInfo("Imported a provider's photo", {
    mediaAssetId: media.id,
    mediaUrl: photo.mediaUrl,
  })
  return media.id
})

/**
 * A provider's photos as our media assets, in its order. Each photo is imported at most once,
 * however many fetches list it. A photo that fails to import is left out; the others still are.
 */
export const importProviderPhotos = Effect.fn("ExternalData.importPhotos")(function* (
  provider: typeof ExternalDataProvider.Type,
  photos: ReadonlyArray<ProviderPhoto>,
) {
  const imported = yield* Effect.forEach(
    EffectArray.dedupeWith(photos, (a, b) => a.mediaUrl === b.mediaUrl).slice(
      0,
      MAX_IMPORTED_PHOTOS_PER_ARTICLE,
    ),
    (photo) =>
      importPhoto(provider, photo).pipe(
        Effect.map(Option.some<MediaAssetId>),
        Effect.catch((error) =>
          Effect.as(
            Effect.logWarning("Skipping a provider's photo that couldn't be imported", {
              mediaUrl: photo.mediaUrl,
              error,
            }),
            Option.none(),
          ),
        ),
      ),
    { concurrency: 1 },
  )

  return EffectArray.dedupe(EffectArray.getSomes(imported))
})
