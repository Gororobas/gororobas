import { ImageMetadata, MediaAssetId, TransformedImageWidthBreakpoints } from "@gororobas/domain"
import { MediaAssetsService } from "@gororobas/server/media-assets/service"
import { MediaAssetsStorage } from "@gororobas/server/media-assets/storage"
import { Effect, FileSystem, Path, Record, Schema } from "effect"
import { HttpClient } from "effect/http"

import { IngestionError } from "./ingestion-error.js"

export const StoredImage = Schema.Struct({
  metadata: ImageMetadata,
  contentType: Schema.String,
  byteSize: Schema.Int,
})

export const IngestionImage = Schema.Struct({
  id: MediaAssetId,
  latest_source: Schema.Struct({ sanity_id: Schema.String }),
})

export const ingestMedia = (
  images: ReadonlyArray<typeof IngestionImage.Type>,
  cacheDirectory: string,
) =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem
    const path = yield* Path.Path
    const service = yield* MediaAssetsService
    const storage = yield* MediaAssetsStorage
    const http = yield* HttpClient.HttpClient
    yield* fs.makeDirectory(cacheDirectory, { recursive: true })
    let downloaded = 0
    let prepared = 0

    const results = yield* Effect.forEach(
      images,
      (image) =>
        Effect.gen(function* () {
          const match = /^image-([a-f0-9]{40})-(\d+)x(\d+)-(jpg|jpeg|png|webp|avif|gif|svg)$/.exec(
            image.latest_source.sanity_id,
          )

          if (!match) {
            return yield* Effect.fail(
              new IngestionError({
                message: `Invalid Sanity image ID: ${image.latest_source.sanity_id}`,
              }),
            )
          }

          const original = path.join(cacheDirectory, image.latest_source.sanity_id)
          const manifest = path.join(cacheDirectory, `${image.id}.json`)

          const variantsExist = (yield* Effect.forEach(
            [
              "original",
              ...TransformedImageWidthBreakpoints.literals.map((width) => `${width}.avif`),
            ],
            (filename) => fs.exists(storage.filePath(image.id, filename)),
            { concurrency: 1 },
          )).every(Boolean)

          if (variantsExist && (yield* fs.exists(manifest))) {
            const stored = yield* fs
              .readFileString(manifest)
              .pipe(Effect.flatMap(Schema.decodeEffect(Schema.fromJsonString(StoredImage))))
            return [image.id, stored] as const
          }

          if (!(yield* fs.exists(original))) {
            const url = `https://cdn.sanity.io/images/4wdqd7lo/production/${match[1]}-${match[2]}x${match[3]}.${match[4]}`

            const bytes = yield* http.get(url).pipe(
              Effect.flatMap((response) =>
                Effect.gen(function* () {
                  if (response.status !== 200) {
                    return yield* new IngestionError({
                      message: `Image download failed (${response.status}): ${image.latest_source.sanity_id}`,
                    })
                  }

                  return yield* response.arrayBuffer
                }),
              ),
            )

            yield* fs.writeFile(`${original}.partial`, new Uint8Array(bytes))
            yield* fs.rename(`${original}.partial`, original)
            downloaded++
          }

          if (yield* fs.exists(storage.filePath(image.id, "original"))) {
            yield* storage.remove(image.id)
          }

          const preparedImage = yield* service.prepare({
            id: image.id,
            file: original,
            contentType:
              match[4] === "svg"
                ? "image/svg+xml"
                : `image/${match[4] === "jpg" ? "jpeg" : match[4]}`,
          })

          if (preparedImage.metadata.format !== "IMAGE") {
            return yield* Effect.fail(
              new IngestionError({ message: `Expected image: ${image.id}` }),
            )
          }

          const stored = { ...preparedImage, metadata: preparedImage.metadata }
          yield* fs.writeFileString(
            manifest,
            yield* Schema.encodeEffect(Schema.fromJsonString(StoredImage))(stored),
          )
          prepared++
          return [image.id, stored] as const
        }),
      { concurrency: 2 },
    )

    yield* Effect.log(
      `Media: ${images.length} originals available, ${downloaded} downloaded, ${prepared} prepared`,
    )
    return { images: Record.fromEntries(results), downloaded, prepared }
  })
