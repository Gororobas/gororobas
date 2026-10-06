import { Array as EffectArray, Effect, FileSystem, Order, Path, Schema } from "effect"

export const previewCollections = {
  plants: "vegetables",
  resources: "resources",
  notes: "notes",
  cultivars: "cultivars",
  tags: "tags",
  users: "users",
  images: "images",
} as const

export type PreviewCollection = keyof typeof previewCollections
export const PreviewRecord = Schema.Record(Schema.String, Schema.Json)
export const PreviewExport = Schema.Struct({ file: Schema.String, data: PreviewRecord })
export const PreviewExports = Schema.Record(Schema.String, Schema.Array(PreviewExport))
export type PreviewExports = typeof PreviewExports.Type

export const readPreviewExports = (directory: string) =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem
    const path = yield* Path.Path
    const collections: Record<string, Array<typeof PreviewExport.Type>> = {}

    for (const [collection, folder] of Object.entries(previewCollections)) {
      const filenames = yield* fs.readDirectory(path.join(directory, folder))

      collections[collection] = yield* Effect.forEach(
        EffectArray.sort(
          filenames.filter((filename) => filename.endsWith(".json")),
          Order.String,
        ),
        (file) =>
          fs.readFileString(path.join(directory, folder, file)).pipe(
            Effect.flatMap(Schema.decodeUnknownEffect(Schema.fromJsonString(PreviewRecord))),
            Effect.map((data) => ({ file, data })),
          ),
        { concurrency: 1 },
      )
    }

    return collections
  })

/** Archive the query result before validation, filtering or conversion can discard Gel data. */
export const archiveGelResult = (name: string) => (data: unknown) =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem
    const directory = new URL("../debug/raw-gel/", import.meta.url).pathname
    yield* fs.makeDirectory(directory, { recursive: true })
    yield* fs.writeFileString(`${directory}${name}.json`, JSON.stringify(data, null, 2))
  })
