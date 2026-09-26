import { Array as EffectArray, Effect, FileSystem, Option, Path, Schema } from "effect"

import { GelClient } from "../gel-client.js"
import { GelTag, TagDataForMigration } from "../schemas/gel/entities.js"

const tagsQuery = `
  select Tag {
    *,
  }
`

export const sourceGelTags = Effect.gen(function* () {
  const fs = yield* FileSystem.FileSystem
  const path = yield* Path.Path
  const gelClient = yield* GelClient
  const tagResults = yield* gelClient
    .use((client) => client.query(tagsQuery))
    .pipe(
      Effect.flatMap((tags) =>
        Effect.all(
          tags.map((tag) => Schema.decodeUnknownEffect(GelTag)(tag)),
          { concurrency: "unbounded", mode: "result" },
        ),
      ),
    )

  yield* Option.match(EffectArray.head(EffectArray.getFailures(tagResults)), {
    onNone: () => Effect.void,
    onSome: (failure) => Effect.logError("Failed parsing a tag: ", failure.message),
  })

  const tagsDirectory = path.join(import.meta.dirname, "..", "..", "debug", "tags")
  yield* fs.makeDirectory(tagsDirectory, { recursive: true })

  yield* Effect.forEach(
    EffectArray.getSuccesses(tagResults),
    (tag) =>
      Schema.encodeEffect(Schema.fromJsonString(TagDataForMigration, { space: 2 }))({
        latest_source: tag,
      }).pipe(
        Effect.flatMap((encoded) =>
          fs.writeFileString(path.join(tagsDirectory, `${tag.handle}.json`), encoded),
        ),
      ),
    { concurrency: 1 },
  )
})
