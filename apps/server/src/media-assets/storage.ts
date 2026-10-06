import { MediaAssetId, MediaAssetStorageError } from "@gororobas/domain"
import { Config, Context, Effect, FileSystem, Path } from "effect"

export class MediaAssetsStorage extends Context.Service<MediaAssetsStorage>()(
  "MediaAssetsStorage",
  {
    make: Effect.gen(function* () {
      const filesystem = yield* FileSystem.FileSystem
      const path = yield* Path.Path

      const root = path.resolve(
        yield* Config.String("MEDIA_ASSETS_DIRECTORY").pipe(
          Config.withDefault("data/media-assets"),
        ),
      )

      yield* filesystem.makeDirectory(root, { recursive: true })

      const storageError = (cause: unknown) => new MediaAssetStorageError({ cause })

      const remove = (id: MediaAssetId) =>
        filesystem
          .remove(path.join(root, id), { recursive: true, force: true })
          .pipe(Effect.mapError(storageError))

      // Staging keeps incomplete uploads private; using the same filesystem makes publication an atomic rename.
      const stage = (input: { file: Uint8Array | string }) =>
        Effect.gen(function* () {
          const directory = yield* Effect.acquireRelease(
            filesystem.makeTempDirectory({ directory: root, prefix: ".upload-" }),
            (directory) =>
              filesystem.remove(directory, { recursive: true, force: true }).pipe(Effect.orDie),
          )

          const filename = path.join(directory, "original")
          yield* typeof input.file === "string"
            ? filesystem.copyFile(input.file, filename)
            : filesystem.writeFile(filename, input.file)
          const info = yield* filesystem.stat(filename)
          return { directory, filename, byteSize: Number(info.size) }
        }).pipe(Effect.mapError(storageError))

      // Publish the entire directory only after all derivatives are ready.
      const publish = (id: MediaAssetId, directory: string) =>
        filesystem.rename(directory, path.join(root, id)).pipe(Effect.mapError(storageError))

      const filePath = (id: MediaAssetId, filename: string) => path.join(root, id, filename)

      return { stage, publish, remove, filePath }
    }),
  },
) {}
