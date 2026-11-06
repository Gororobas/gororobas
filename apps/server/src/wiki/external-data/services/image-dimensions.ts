import { PositiveInteger } from "@gororobas/domain"
import { Config, Context, Effect, Layer, Option, Schema } from "effect"
import { HttpClient } from "effect/http"
import sharp from "sharp"

/**
 * Image headers come first in every format we show, though JPEG's can follow a long EXIF block.
 * Servers that ignore `Range` send the whole file, which is read the same way.
 */
const HEADER_BYTES = 256 * 1024

export const ImageDimensionsResult = Schema.Struct({
  width: PositiveInteger,
  height: PositiveInteger,
})

export type ImageDimensionsResult = typeof ImageDimensionsResult.Type

/** Reads a remote image's dimensions as displayed (after EXIF rotation) from its first bytes. */
export const readImageDimensions = (bytes: Uint8Array) =>
  Effect.tryPromise(() => sharp(bytes).metadata()).pipe(
    Effect.flatMap(({ autoOrient }) => Schema.decodeEffect(ImageDimensionsResult)(autoOrient)),
    Effect.option,
  )

export const makeImageDimensions = Effect.gen(function* () {
  const client = yield* HttpClient.HttpClient
  const userAgent = yield* Config.String("EXTERNAL_DATA_USER_AGENT").pipe(
    Config.withDefault("Gororobas/1.0 (https://gororobas.com)"),
  )

  /** Placeholders and layouts work without dimensions, so failures leave them unknown. */
  const probe = Effect.fn("ImageDimensions.probe")(function* (url: string) {
    const maybeBytes = yield* client
      .get(url, { headers: { "User-Agent": userAgent, Range: `bytes=0-${HEADER_BYTES - 1}` } })
      .pipe(
        Effect.filterOrFail((response) => response.status >= 200 && response.status < 300),
        Effect.flatMap((response) => response.arrayBuffer),
        Effect.timeout("15 seconds"),
        Effect.option,
      )

    const maybeDimensions = Option.isSome(maybeBytes)
      ? yield* readImageDimensions(new Uint8Array(maybeBytes.value))
      : Option.none()

    if (Option.isNone(maybeDimensions)) {
      yield* Effect.logWarning("Couldn't read an external image's dimensions").pipe(
        Effect.annotateLogs({ url }),
      )
    }

    return maybeDimensions
  })

  return { probe }
})

export class ImageDimensions extends Context.Service<
  ImageDimensions,
  Effect.Success<typeof makeImageDimensions>
>()("external-data/ImageDimensions") {}

export const ImageDimensionsLive = Layer.effect(ImageDimensions)(makeImageDimensions)
