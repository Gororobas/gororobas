import { TiptapDocument, WikiPlantArticle } from "@gororobas/domain"
import { Effect, Array as EffectArray, FileSystem, Option, Path, Schema } from "effect"

import { GelClient } from "../gel-client.js"
import { GelVegetableWithEditSuggestions } from "../schemas/gel/entities.js"
import { gelGenderToGrammaticalGender } from "../schemas/gel/enums.js"
import {
  reconstructGelVegetableHistory,
  VegetableDataForMigration,
  VegetableHistoryEntryForMigration,
} from "./backward-reconstruction.js"
import {
  gelVegetableNamesToCrdtList,
  gelVegetableToPlantEditableAttributes,
} from "./gel-vegetable-to-wiki-plant-article.js"

const vegetablesQuery = `
  select Vegetable {
    *,
    photos := (select .photos order by @order_index asc empty last) {
      *,
      sources := (select .sources order by @order_index asc empty last) { * }
    },
    varieties := (select .varieties order by @order_index asc empty last) {
      *,
      photos: {
        *,
        sources := (select .sources order by @order_index asc empty last) { * },
      }
    },
    friends: {
      id,
    },
    sources: {
      *,
    },
    edit_suggestions := (select .<target_object[is EditSuggestion]
      filter .status = EditSuggestionStatus.MERGED) {
      *
    }
  }
`

export const sourceGelVegetables = Effect.gen(function* () {
  const fs = yield* FileSystem.FileSystem
  const path = yield* Path.Path
  const gelClient = yield* GelClient
  const vegetableResults = yield* gelClient
    .use((client) => client.query(vegetablesQuery))
    .pipe(
      Effect.flatMap((vegetables) =>
        Effect.all(
          vegetables.map((vegetable) =>
            Schema.decodeUnknownEffect(GelVegetableWithEditSuggestions)(vegetable),
          ),
          { concurrency: "unbounded", mode: "result" },
        ),
      ),
    )

  yield* Option.match(EffectArray.head(EffectArray.getFailures(vegetableResults)), {
    onNone: () => Effect.void,
    onSome: (failure) => Effect.logError("Failed parsing a vegetable: ", failure.message),
  })

  const vegetables = EffectArray.getSuccesses(vegetableResults)

  const historyResults = yield* Effect.all(
    vegetables.map(({ edit_suggestions, ...source }) =>
      reconstructGelVegetableHistory(source, edit_suggestions).pipe(
        Effect.map((history) => ({ source, history, edit_suggestions })),
      ),
    ),
    { concurrency: "unbounded", mode: "result" },
  )

  const vegetablesDirectory = path.join(import.meta.dirname, "..", "..", "debug", "vegetables")
  yield* fs.makeDirectory(vegetablesDirectory, { recursive: true })

  yield* Effect.forEach(
    EffectArray.getSuccesses(historyResults),
    ({ source, history, edit_suggestions }) =>
      Effect.gen(function* () {
        const historyEntries = history.map((historyEntry) =>
          VegetableHistoryEntryForMigration.make({
            ...historyEntry,
            article: WikiPlantArticle.EditableArticle.make({
              kind: "PLANT",
              attributes: gelVegetableToPlantEditableAttributes(historyEntry.state),
              translations: {
                pt: {
                  commonNames: gelVegetableNamesToCrdtList(historyEntry.state.names),
                  content: Option.fromNullishOr(
                    Schema.decodeUnknownSync(Schema.NullishOr(TiptapDocument))(
                      historyEntry.state.content,
                    ),
                  ),
                  grammaticalGender: Option.fromNullishOr(
                    gelGenderToGrammaticalGender(historyEntry.state.gender),
                  ),
                },
              },
            }),
          }),
        )
        const data = VegetableDataForMigration.make({
          latest_source: source,
          edit_suggestions,
          history: historyEntries,
        })
        const encoded = yield* Schema.encodeEffect(
          Schema.fromJsonString(VegetableDataForMigration, { space: 2 }),
        )(data)
        yield* fs.writeFileString(path.join(vegetablesDirectory, `${source.handle}.json`), encoded)
      }),
    { concurrency: 1 },
  )

  yield* Option.match(EffectArray.head(EffectArray.getFailures(historyResults)), {
    onNone: () => Effect.void,
    onSome: (failure) => Effect.logError("Failed parsing a vegetable's history: ", failure.message),
  })
})
