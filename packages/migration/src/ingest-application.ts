import { NodeRuntime, NodeServices } from "@effect/platform-node"
import { Config, Effect, FileSystem, Path, Schema } from "effect"

import { importPreview } from "./import-preview.js"
import { IngestionError } from "./ingestion-error.js"

export const ingestApplication = (exportDirectory: string) =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem
    const path = yield* Path.Path
    const serverDirectory = new URL("../../../apps/server/", import.meta.url).pathname

    const database = path.resolve(
      yield* Config.String("APP_DB_FILENAME").pipe(
        Config.withDefault(path.join(serverDirectory, "gororobas.db")),
      ),
    )

    const mediaAssetsDirectory = path.resolve(
      yield* Config.String("MEDIA_ASSETS_DIRECTORY").pipe(
        Config.withDefault(path.join(serverDirectory, "data/media-assets")),
      ),
    )

    const mediaCacheDirectory = path.resolve(
      yield* Config.String("MIGRATION_MEDIA_CACHE_DIRECTORY").pipe(
        Config.withDefault(path.join(exportDirectory, "media-cache")),
      ),
    )

    if (
      (yield* fs.exists(database)) &&
      ((yield* fs.exists(`${database}-wal`)) || (yield* fs.exists(`${database}-shm`)))
    ) {
      return yield* new IngestionError({
        message: `Stop the server before replacing ${database}; SQLite sidecars are present`,
      })
    }

    const report = yield* importPreview({
      exportDirectory,
      outputRoot: path.join(exportDirectory, "sqlite"),
      application: { mediaAssetsDirectory, mediaCacheDirectory },
    })

    yield* fs.makeDirectory(path.dirname(database), { recursive: true })
    const backup = (yield* fs.exists(database))
      ? `${database}.before-${path.basename(report.directory)}`
      : undefined
    const staged = `${database}.importing`
    yield* fs.copyFile(report.database, staged)
    if (backup) yield* fs.copyFile(database, backup)

    yield* Effect.forEach(
      ["-wal", "-shm"],
      (suffix) =>
        Effect.gen(function* () {
          if (yield* fs.exists(`${database}${suffix}`)) {
            yield* fs.rename(
              `${database}${suffix}`,
              `${database}${suffix}.before-${path.basename(report.directory)}`,
            )
          }
        }),
      { concurrency: 1 },
    )

    yield* fs.rename(staged, database)

    const result = {
      ...report,
      sourceDatabase: report.database,
      database,
      backup,
      mediaAssetsDirectory,
      mediaCacheDirectory,
    }

    yield* fs.writeFileString(
      path.join(report.directory, "application.json"),
      yield* Schema.encodeEffect(Schema.fromJsonString(Schema.Unknown, { space: 2 }))(result),
    )
    yield* Effect.log(
      `Application import: ${yield* Schema.encodeEffect(Schema.fromJsonString(Schema.Unknown))(result)}`,
    )
    return result
  })

if (process.argv[1] === import.meta.filename) {
  ingestApplication(process.argv[2] ?? new URL("../debug/", import.meta.url).pathname).pipe(
    Effect.provide(NodeServices.layer),
    NodeRuntime.runMain,
  )
}
