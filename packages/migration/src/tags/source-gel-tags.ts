import { IdGen, TagId } from "@gororobas/domain"
import { Array as EffectArray, Effect, FileSystem, Option, Path, Schema } from "effect"

import { GelClient } from "../gel-client.js"
import { archiveGelResult } from "../preview-exports.js"
import { GelTag, TagDataForMigration } from "../schemas/gel/entities.js"
import { MigrationContext } from "../services/migration-context.js"

const tagsQuery = `
  select Tag {
    *,
  }
`

export const sourceGelTags = Effect.gen(function* () {
  const fs = yield* FileSystem.FileSystem
  const path = yield* Path.Path
  const context = yield* MigrationContext
  const idGen = yield* IdGen
  const gelClient = yield* GelClient
  const tagResults = yield* gelClient
    .use((client) => client.query(tagsQuery))
    .pipe(
      Effect.tap(archiveGelResult("tags")),
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
    [
      ...EffectArray.getSuccesses(tagResults),
      ...["EXPERIMENTO", "ENSINAMENTO", "DESCOBERTA", "PERGUNTA", "INSPIRACAO"].map((type) =>
        Schema.decodeUnknownSync(GelTag)({
          id: `note-type:${type}`,
          handle: `tipo-de-nota-${type.toLowerCase()}`,
          names: [type],
        }),
      ),
    ],
    (tag) =>
      Effect.gen(function* () {
        const operation = yield* context.planMigrationOp(tag, "Tag")
        if (operation.op === "create")
          yield* operation.execute(() => Effect.sync(() => idGen.generate()))
        if (operation.op === "update") yield* operation.execute(() => Effect.void)
        const id = yield* context
          .resolveId(tag.id, "Tag")
          .pipe(Effect.flatMap(Schema.decodeUnknownEffect(TagId)))
        yield* Schema.encodeEffect(Schema.fromJsonString(TagDataForMigration, { space: 2 }))({
          latest_source: tag,
          id,
        }).pipe(
          Effect.flatMap((encoded) =>
            fs.writeFileString(path.join(tagsDirectory, `${tag.handle}.json`), encoded),
          ),
        )
      }),
    { concurrency: 1 },
  )
})
