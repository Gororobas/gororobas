import {
  MediaAssetMetadata,
  TransformedImageWidthBreakpoints,
  TransformedVideoHeightBreakpoints,
} from "@gororobas/domain"
import { registerMediabunnyServer } from "@mediabunny/server"
import { Effect, FileSystem, Schema } from "effect"
import {
  ALL_FORMATS,
  Conversion,
  FilePathSource,
  FilePathTarget,
  HlsOutputFormat,
  Input,
  Mp4OutputFormat,
  MpegTsOutputFormat,
  Output,
  PathedTarget,
  Quality,
  WebMOutputFormat,
} from "mediabunny"
import { join } from "node:path"
import sharp from "sharp"

export class MediaAssetProcessingError extends Schema.TaggedError<MediaAssetProcessingError>()(
  "MediaAssetProcessingError",
  {
    cause: Schema.Unknown,
  },
) {}

const processingPromise = <A>(operation: () => PromiseLike<A>) =>
  Effect.tryPromise({ try: operation, catch: (cause) => new MediaAssetProcessingError({ cause }) })

const openMedia = (filename: string) =>
  Effect.acquireRelease(
    Effect.try({
      try: () => new Input({ source: new FilePathSource(filename), formats: ALL_FORMATS }),
      catch: (cause) => new MediaAssetProcessingError({ cause }),
    }),
    (input) => Effect.sync(() => input.dispose()),
  )

export const readMediaAssetMetadata = Effect.fn("MediaAssets.readMetadata")(
  (filename: string, format: MediaAssetMetadata["format"]) =>
    Effect.scoped(
      Effect.gen(function* () {
        yield* Effect.annotateCurrentSpan({ "media.format": format })
        if (format === "IMAGE") {
          const metadata = yield* processingPromise(() => sharp(filename).metadata())
          return yield* Schema.decodeUnknownEffect(MediaAssetMetadata)({
            format,
            originalWidth: metadata.width,
            originalHeight: metadata.height,
            ...(metadata.density ? { density: metadata.density } : {}),
          })
        }

        const input = yield* openMedia(filename)
        const duration = yield* processingPromise(() =>
          input.computeDuration().then((seconds) => seconds * 1000),
        )

        if (format === "VIDEO") {
          const video = yield* processingPromise(() => input.getPrimaryVideoTrack())
          if (!video) return yield* new MediaAssetProcessingError({ cause: "No video track" })
          return yield* Schema.decodeEffect(MediaAssetMetadata)({
            format,
            duration,
            originalWidth: yield* processingPromise(() => video.getDisplayWidth()),
            originalHeight: yield* processingPromise(() => video.getDisplayHeight()),
            rotation: yield* processingPromise(() => video.getRotation()),
            codec: (yield* processingPromise(() => video.getCodec())) ?? undefined,
          })
        }

        const audio = yield* processingPromise(() => input.getPrimaryAudioTrack())
        if (!audio) return yield* new MediaAssetProcessingError({ cause: "No audio track" })

        return yield* Schema.decodeEffect(MediaAssetMetadata)({
          format,
          duration,
          sampleRate: yield* processingPromise(() => audio.getSampleRate()),
          numberOfChannels: yield* processingPromise(() => audio.getNumberOfChannels()),
          codec: (yield* processingPromise(() => audio.getCodec())) ?? undefined,
        })
      }),
    ).pipe(Effect.mapError((cause) => new MediaAssetProcessingError({ cause }))),
)

const convert = Effect.fn("MediaAssets.convert")((options: Parameters<typeof Conversion.init>[0]) =>
  Effect.gen(function* () {
    yield* Effect.annotateCurrentSpan({
      "media.output.format": options.output.format.constructor.name,
    })
    const conversion = yield* processingPromise(() => Conversion.init(options))
    if (!conversion.isValid)
      return yield* new MediaAssetProcessingError({ cause: "Media cannot be converted" })
    // A failed or interrupted conversion must release codecs and partial output handles.
    yield* Effect.acquireRelease(Effect.succeed(conversion), (conversion) =>
      Effect.promise(() => conversion.cancel()),
    )
    yield* processingPromise(() => conversion.execute())
  }),
)

const transformImage = Effect.fn("MediaAssets.transformImage")(
  (filename: string, directory: string, width: typeof TransformedImageWidthBreakpoints.Type) =>
    Effect.annotateCurrentSpan({ "media.image.width": width }).pipe(
      Effect.andThen(
        processingPromise(() =>
          sharp(filename)
            .rotate()
            .resize({ width, withoutEnlargement: true })
            .avif({ quality: 60 })
            .toFile(join(directory, `${width}.avif`)),
        ),
      ),
    ),
)

/** Derivatives are reproducible; the original file and its metadata remain unchanged. */
export const processMediaAsset = Effect.fn("MediaAssets.process")(
  (input: { filename: string; directory: string; metadata: MediaAssetMetadata }) =>
    Effect.scoped(
      Effect.gen(function* () {
        const filesystem = yield* FileSystem.FileSystem
        yield* filesystem.makeDirectory(input.directory, { recursive: true })
        const metadata = input.metadata
        yield* Effect.annotateCurrentSpan({ "media.format": metadata.format })

        if (metadata.format === "IMAGE") {
          yield* Effect.forEach(
            TransformedImageWidthBreakpoints.literals,
            (size) => transformImage(input.filename, input.directory, size),
            { discard: true },
          )
          return
        }

        yield* Effect.try({
          try: () => registerMediabunnyServer({ hardwareContext: null }),
          catch: (cause) => new MediaAssetProcessingError({ cause }),
        })
        const media = yield* openMedia(input.filename)

        if (metadata.format === "AUDIO") {
          yield* Effect.forEach(
            ["opus", "aac"] as const,
            (codec) =>
              convert({
                input: media,
                output: new Output({
                  format: codec === "opus" ? new WebMOutputFormat() : new Mp4OutputFormat(),
                  target: new FilePathTarget(
                    join(input.directory, codec === "opus" ? "audio.webm" : "audio.m4a"),
                  ),
                }),
                tracks: "primary",
                copy: false,
                video: { discard: true },
                audio: {
                  codec,
                  quality: new Quality({ bitrate: 96_000 }),
                  numberOfChannels: Math.min(2, metadata.numberOfChannels),
                },
              }),
            { discard: true },
          )
          return
        }

        const heights = [
          ...new Set(
            TransformedVideoHeightBreakpoints.literals.map((height) =>
              Math.min(height, metadata.originalHeight),
            ),
          ),
        ]
        const video = heights.map((height) => ({
          height: Math.max(2, Math.floor(height / 2) * 2),
          codec: "avc" as const,
          quality: new Quality("medium"),
          keyFrameInterval: 4,
        }))
        yield* convert({
          input: media,
          output: new Output({
            format: new HlsOutputFormat({
              segmentFormat: new MpegTsOutputFormat(),
              targetDuration: 4,
            }),
            target: new PathedTarget(
              "master.m3u8",
              (request) => new FilePathTarget(join(input.directory, request.path)),
            ),
          }),
          tracks: "primary",
          copy: false,
          video,
          audio: { codec: "aac", quality: new Quality({ bitrate: 128_000 }) },
        })
        yield* convert({
          input: media,
          output: new Output({
            format: new Mp4OutputFormat({ fastStart: "fragmented" }),
            target: new FilePathTarget(join(input.directory, "video.mp4")),
          }),
          tracks: "primary",
          copy: false,
          video: video[video.length - 1],
          audio: { codec: "aac", quality: new Quality({ bitrate: 128_000 }) },
        })
      }),
    ).pipe(Effect.mapError((cause) => new MediaAssetProcessingError({ cause }))),
)
