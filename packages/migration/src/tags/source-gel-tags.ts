import {
  IdGen,
  WikiArticleCommonNameInCrdtList,
  WikiArticleEditableData,
  WikiArticleEditableTranslations,
  WikiArticleId,
  WikiConceptArticle,
  WikiPlaceArticle,
} from "@gororobas/domain"
import { Array as EffectArray, Effect, FileSystem, Option, Path, Record, Schema } from "effect"

import { GelClient } from "../gel-client.js"
import { migrateRichText } from "../migrate-rich-text.js"
import { archiveGelResult } from "../preview-exports.js"
import { GelTag } from "../schemas/gel/entities.js"
import { GelTiptapDocument } from "../schemas/gel/rich-text.js"
import { MigrationContext } from "../services/migration-context.js"
import { gelVegetableNamesToCrdtList } from "../vegetables/gel-vegetable-to-wiki-plant-article.js"

const tagsQuery = `
  select Tag {
    *,
  }
`

/**
 * Gel's note types were tags too. As CONCEPT articles, notes keep pointing at them through
 * `publication_wiki_articles`.
 */
const NOTE_TYPE_NAMES = {
  EXPERIMENTO: "Experimento",
  ENSINAMENTO: "Ensinamento",
  DESCOBERTA: "Descoberta",
  PERGUNTA: "Pergunta",
  INSPIRACAO: "Inspiração",
} as const

export const noteTypeGelId = (type: string) => `note-type:${type}`

/** Gel tagged content with Brazil's biomes; in the wiki they're places people can be in. */
const BIOME_TAG_HANDLES: ReadonlyArray<string> = [
  "amazonia",
  "caatinga",
  "cerrado",
  "mata-atlantica",
  "pampa",
  "pantanal",
]

/** Most tags are CONCEPT articles; biomes are PLACE articles. */
export const gelTagArticle = ({
  handle,
  translations,
}: Readonly<{
  handle: string
  translations: WikiArticleEditableTranslations
}>): WikiArticleEditableData =>
  BIOME_TAG_HANDLES.includes(handle)
    ? WikiPlaceArticle.EditableArticle.make({
        kind: "PLACE",
        attributes: WikiPlaceArticle.EditableAttributes.make({
          placeKind: Option.some("BIOME"),
          whosOnFirstId: Option.none(),
          wikidataId: Option.none(),
          geonamesId: Option.none(),
        }),
        translations,
      })
    : WikiConceptArticle.EditableArticle.make({
        kind: "CONCEPT",
        attributes: WikiConceptArticle.EditableAttributes.make({}),
        translations,
      })

/** Gel tags become CONCEPT (or, for biomes, PLACE) wiki articles that keep the tag's mapped ID. */
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

  const conceptsDirectory = path.join(import.meta.dirname, "..", "..", "debug", "concepts")
  yield* fs.makeDirectory(conceptsDirectory, { recursive: true })

  yield* Effect.forEach(
    [
      ...EffectArray.getSuccesses(tagResults),
      ...Record.toEntries(NOTE_TYPE_NAMES).map(([type, name]) =>
        Schema.decodeSync(GelTag)({
          id: noteTypeGelId(type),
          handle: `tipo-de-nota-${type.toLowerCase()}`,
          names: [name],
        }),
      ),
    ],
    (tag) =>
      Effect.gen(function* () {
        const operation = yield* context.planMigrationOp(tag, "Tag")
        if (operation.op === "create") {
          yield* operation.execute(() => Effect.sync(() => idGen.generate()))
        }
        if (operation.op === "update") yield* operation.execute(() => Effect.void)
        const id = yield* context
          .resolveId(tag.id, "Tag")
          .pipe(Effect.flatMap(Schema.decodeEffect(WikiArticleId)))

        const translations = yield* Schema.decodeEffect(WikiArticleEditableTranslations)({
          pt: {
            commonNames: yield* Schema.encodeEffect(
              Schema.NonEmptyArray(WikiArticleCommonNameInCrdtList),
            )(gelVegetableNamesToCrdtList(tag.names)),
            content: tag.description
              ? yield* migrateRichText(
                  yield* Schema.decodeUnknownEffect(GelTiptapDocument)(tag.description),
                )
              : undefined,
          },
        })

        const article = gelTagArticle({ handle: tag.handle, translations })

        yield* Schema.encodeEffect(Schema.fromJsonString(Schema.Unknown, { space: 2 }))({
          id,
          latest_source: tag,
          article: yield* Schema.encodeEffect(WikiArticleEditableData)(article),
        }).pipe(
          Effect.flatMap((encoded) =>
            fs.writeFileString(path.join(conceptsDirectory, `${tag.handle}.json`), encoded),
          ),
        )
      }),
    { concurrency: 1 },
  )
})
