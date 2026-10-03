import { WikiArticleId, WikiPlantCultivarArticle } from "@gororobas/domain"
import { Effect, FileSystem, Option, Path, Schema } from "effect"

import { GelClient } from "../gel-client.js"
import { archiveGelResult } from "../preview-exports.js"
import { GelVegetableVariety } from "../schemas/gel/entities.js"
import { MigrationContext } from "../services/migration-context.js"
import { gelVegetableNamesToCrdtList } from "./gel-vegetable-to-wiki-plant-article.js"

class CultivarParentError extends Schema.TaggedError<CultivarParentError>()("CultivarParentError", {
  message: Schema.String,
}) {}

const Variety = Schema.Struct({
  ...GelVegetableVariety.fields,
  parents: Schema.ArrayEnsure(Schema.Struct({ id: Schema.String, handle: Schema.String })),
})
export const sourceGelVegetableVarieties = Effect.gen(function* () {
  const client = yield* GelClient
  const context = yield* MigrationContext
  const fs = yield* FileSystem.FileSystem
  const path = yield* Path.Path
  const sources = yield* client
    .use((gel) =>
      gel.query(
        `select VegetableVariety { *, photos: { *, sources: { * } }, parents := .<varieties[is Vegetable] { id, handle } }`,
      ),
    )
    .pipe(
      Effect.tap(archiveGelResult("cultivars")),
      Effect.flatMap(Schema.decodeUnknownEffect(Schema.Array(Variety))),
    )
  const directory = path.join(import.meta.dirname, "..", "..", "debug", "cultivars")
  yield* fs.makeDirectory(directory, { recursive: true })
  yield* Effect.forEach(
    sources,
    (source) =>
      Effect.gen(function* () {
        if (source.parents.length !== 1)
          return yield* Effect.fail(
            new CultivarParentError({
              message: `Variety ${source.handle} has ${source.parents.length} parents; needs manual resolution`,
            }),
          )
        const id = yield* context.resolveId(source.id, "WikiArticle")
        const parentPlantId = yield* context
          .resolveId(source.parents[0].id, "WikiArticle")
          .pipe(Effect.flatMap(Schema.decodeUnknownEffect(WikiArticleId)))
        const photoIds = yield* Effect.forEach(
          source.photos,
          (photo) => context.resolveId(photo.id, "Image"),
          { concurrency: 1 },
        )
        const article = WikiPlantCultivarArticle.EditableArticle.make({
          kind: "PLANT_CULTIVAR",
          attributes: WikiPlantCultivarArticle.EditableAttributes.make({ parentPlantId }),
          translations: {
            pt: {
              commonNames: gelVegetableNamesToCrdtList(source.names),
              content: Option.none(),
              grammaticalGender: Option.none(),
            },
          },
        })
        const data = { id, latest_source: source, article, photoIds }
        yield* fs.writeFileString(
          path.join(directory, `${source.handle}.json`),
          yield* Schema.encodeEffect(Schema.fromJsonString(Schema.Unknown, { space: 2 }))({
            ...data,
            article: yield* Schema.encodeEffect(WikiPlantCultivarArticle.EditableArticle)(article),
          }),
        )
      }),
    { concurrency: 1 },
  )
})
