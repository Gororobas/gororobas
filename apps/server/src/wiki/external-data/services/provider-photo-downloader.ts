import { Config, Context, Effect, Layer, Schema, Semaphore } from "effect"
import { HttpClientError, HttpClient } from "effect/http"

/** Larger files aren't photos we'd show; iNaturalist's originals are a few megabytes. */
const MAX_PHOTO_BYTES = 30 * 1024 * 1024

export class PhotoDownloadError extends Schema.TaggedError<PhotoDownloadError>()(
  "PhotoDownloadError",
  { url: Schema.String, message: Schema.String, retryable: Schema.Boolean },
) {}

/**
 * Downloads the files providers' photos point to, such as iNaturalist's. Like provider requests,
 * downloads run one at a time with a cooldown after each attempt, and retry transient failures.
 */
export const makeProviderPhotoDownloader = Effect.gen(function* () {
  const client = yield* HttpClient.HttpClient
  const semaphore = yield* Semaphore.make(1)
  const userAgent = yield* Config.String("EXTERNAL_DATA_USER_AGENT").pipe(
    Config.withDefault("Gororobas/1.0 (https://gororobas.com)"),
  )

  const download = (url: string) =>
    Effect.gen(function* () {
      const fail = (message: string, retryable: boolean) =>
        new PhotoDownloadError({ url, message, retryable })

      const response = yield* client.get(url, { headers: { "User-Agent": userAgent } }).pipe(
        Effect.timeout("30 seconds"),
        Effect.mapError((error) =>
          fail(
            `Request failed (${HttpClientError.isHttpClientError(error) ? error.reason._tag : error._tag})`,
            true,
          ),
        ),
      )

      yield* Effect.annotateCurrentSpan("http.response.status_code", response.status)

      if (response.status < 200 || response.status >= 300) {
        return yield* fail(
          `Returned HTTP ${response.status}`,
          response.status === 429 || response.status >= 500,
        )
      }

      if (Number(response.headers["content-length"] ?? 0) > MAX_PHOTO_BYTES) {
        return yield* fail("File is too large", false)
      }

      const bytes = yield* response.arrayBuffer.pipe(
        Effect.timeout("2 minutes"),
        Effect.mapError(() => fail("Reading the file failed", true)),
      )

      if (bytes.byteLength > MAX_PHOTO_BYTES) return yield* fail("File is too large", false)

      return new Uint8Array(bytes)
    }).pipe(
      Effect.tapError((error) =>
        Effect.logWarning("Downloading a provider's photo failed", {
          url,
          message: error.message,
          retryable: error.retryable,
        }),
      ),
      Effect.withSpan("ExternalData.downloadPhoto", { attributes: { "url.full": url } }),
      Effect.ensuring(Effect.sleep("1 second")),
      semaphore.withPermits(1),
      Effect.retry({ times: 2, while: (error) => error.retryable }),
    )

  return { download }
})

export class ProviderPhotoDownloader extends Context.Service<
  ProviderPhotoDownloader,
  Effect.Success<typeof makeProviderPhotoDownloader>
>()("external-data/ProviderPhotoDownloader") {}

export const ProviderPhotoDownloaderLive = Layer.effect(ProviderPhotoDownloader)(
  makeProviderPhotoDownloader,
)
