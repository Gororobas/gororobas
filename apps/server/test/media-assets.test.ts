import { NodePath, NodeServices } from "@effect/platform-node"
import { assert, expect, it } from "@effect/vitest"
import { registerMediabunnyServer } from "@mediabunny/server"
import { FileSystem, Duration, Effect, Path } from "effect"
import { FilePathTarget, Mp4OutputFormat, Output, VideoSample, VideoSampleSource } from "mediabunny"
import sharp from "sharp"

import { processMediaAsset, readMediaAssetMetadata } from "../src/media-assets/processing.js"
const { join } = Effect.runSync(Effect.provide(Path.Path, NodePath.layer))

it.live(
  "retains original dimensions and creates proportional AVIF derivatives without upscaling",
  Effect.fn(function* () {
    const filesystem = yield* Effect.provide(FileSystem.FileSystem, NodeServices.layer)
    const directory = yield* filesystem.makeTempDirectoryScoped({
      prefix: "mediaAssets-image-",
    })
    const filename = join(directory, "original.png")

    yield* Effect.tryPromise(() =>
      sharp({
        create: {
          width: 100,
          height: 40,
          channels: 3,
          background: "red",
        },
      })
        .png()
        .toFile(filename),
    )

    const metadata = yield* readMediaAssetMetadata(filename, "IMAGE")

    yield* processMediaAsset({
      filename,
      directory,
      metadata,
    }).pipe(Effect.provide(NodeServices.layer))

    expect(metadata).toMatchObject({
      originalWidth: 100,
      originalHeight: 40,
    })

    expect(
      yield* Effect.tryPromise(() => sharp(join(directory, "50.avif")).metadata()),
    ).toMatchObject({
      format: "heif",
      width: 50,
      height: 20,
    })

    expect(
      yield* Effect.tryPromise(() => sharp(join(directory, "2400.avif")).metadata()),
    ).toMatchObject({
      width: 100,
      height: 40,
    })

    expect(yield* Effect.tryPromise(() => sharp(filename).metadata())).toMatchObject({
      width: 100,
      height: 40,
    })
  }),
)

it.live(
  "processes audio and adaptive video through Mediabunny without CLI tools",
  Effect.fn(function* () {
    const filesystem = yield* Effect.provide(FileSystem.FileSystem, NodeServices.layer)
    const directory = yield* filesystem.makeTempDirectoryScoped({
      prefix: "mediaAssets-media-",
    })
    registerMediabunnyServer({
      hardwareContext: null,
    })
    const audioFile = join(directory, "original.wav")
    const samples = 4800
    const wav = Buffer.alloc(44 + samples * 2)
    wav.write("RIFF", 0)
    wav.writeUInt32LE(wav.length - 8, 4)
    wav.write("WAVEfmt ", 8)
    wav.writeUInt32LE(16, 16)
    wav.writeUInt16LE(1, 20)
    wav.writeUInt16LE(1, 22)
    wav.writeUInt32LE(48000, 24)
    wav.writeUInt32LE(96000, 28)
    wav.writeUInt16LE(2, 32)
    wav.writeUInt16LE(16, 34)
    wav.write("data", 36)
    wav.writeUInt32LE(samples * 2, 40)
    yield* filesystem.writeFile(audioFile, wav)
    const audio = yield* readMediaAssetMetadata(audioFile, "AUDIO")
    expect(audio).toMatchObject({
      sampleRate: 48000,
      numberOfChannels: 1,
    })
    if (audio.format !== "AUDIO") return yield* Effect.die("Expected audio")
    expect(Duration.toMillis(audio.duration)).toBeCloseTo(100)

    yield* processMediaAsset({
      filename: audioFile,
      directory,
      metadata: audio,
    }).pipe(Effect.provide(NodeServices.layer))

    yield* Effect.forEach(
      ["audio.webm", "audio.m4a"],
      Effect.fn(function* (name) {
        const metadata = yield* readMediaAssetMetadata(join(directory, name), "AUDIO")
        assert(metadata.format === "AUDIO")
        expect(Duration.toSeconds(metadata.duration)).toBeCloseTo(0.1, 1)
      }),
      { concurrency: 1, discard: true },
    )

    const filename = join(directory, "original.mp4")
    const output = new Output({
      format: new Mp4OutputFormat(),
      target: new FilePathTarget(filename),
    })
    const source = new VideoSampleSource({
      codec: "avc",
      bitrate: 100_000,
    })
    output.addVideoTrack(source)
    yield* Effect.tryPromise(() => output.start())

    yield* Effect.forEach(
      [0, 1, 2, 3],
      Effect.fn(function* (index) {
        using frame = new VideoSample(new Uint8Array(640 * 480 * 4).fill(128), {
          format: "RGBA",
          codedWidth: 640,
          codedHeight: 480,
          timestamp: index / 2,
          duration: 0.5,
        })

        yield* Effect.tryPromise(() => source.add(frame))
      }),
      { concurrency: 1, discard: true },
    )

    source.close()
    yield* Effect.tryPromise(() => output.finalize())
    const video = yield* readMediaAssetMetadata(filename, "VIDEO")
    expect(video).toMatchObject({
      originalWidth: 640,
      originalHeight: 480,
    })

    yield* processMediaAsset({
      filename,
      directory,
      metadata: video,
    }).pipe(Effect.provide(NodeServices.layer))

    if (video.format !== "VIDEO") return yield* Effect.die("Expected video")
    expect(Duration.toMillis(video.duration)).toBeCloseTo(2000)
    const playlist = yield* filesystem.readFileString(join(directory, "master.m3u8"))
    expect(playlist).toContain("#EXTM3U")
    expect(playlist.match(/#EXT-X-STREAM-INF/g)).toHaveLength(2)
    expect(yield* readMediaAssetMetadata(join(directory, "video.mp4"), "VIDEO")).toMatchObject({
      originalWidth: 640,
      originalHeight: 480,
    })
  }),
  30_000,
)
