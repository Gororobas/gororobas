import { GrammaticalGender, TiptapDocument, WikiPlantArticle } from "@gororobas/domain"
import { Array as EffectArray, Effect, FileSystem, Option, Path, Schema } from "effect"
import { Command } from "effect/unstable/cli"

import { GelClient } from "./gel-client.js"
import {
  gelVegetableNamesToCrdtList,
  gelVegetableToPlantEditableAttributes,
} from "./gel-vegetable-to-wiki-plant-article.js"
import { GelVegetableWithEditSuggestions } from "./schemas/gel/entities.js"
import { GelGender } from "./schemas/gel/enums.js"
import {
  reconstructGelVegetableHistory,
  VegetableDataForMigration,
  VegetableHistoryEntryForMigration,
} from "./utils/backward-reconstruction.js"

const GEL_GENDER_MAP: Record<GelGender, GrammaticalGender> = {
  FEMININO: "FEMALE",
  MASCULINO: "MALE",
  NEUTRO: "NEUTRAL",
} as const

const gelGenderToGrammaticalGender = (
  // oxlint-disable-next-line effect/prefer-option-over-null
  gender: GelGender | null | undefined,
  // oxlint-disable-next-line effect/prefer-option-over-null
): GrammaticalGender | null => {
  if (!gender) return null

  return GEL_GENDER_MAP[gender]
}

const vegetablesQuery = `
  select Vegetable {
    *,
    photos := (select .photos order by @order_index asc empty last) {
      *
    },
    varieties := (select .varieties order by @order_index asc empty last) {
      *
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

export const migrate = Command.make("migrate", {}, () =>
  Effect.gen(function* () {
    const gelClient = yield* GelClient
    const vegetableResults = yield* gelClient
      .use((client) => client.query(vegetablesQuery))
      .pipe(
        // When needed to debug:
        // Effect.tap((vegetables) =>
        //   Effect.log(vegetables.flatMap((v) => (v.sources.length > 0 ? v.sources : []))),
        // ),
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
          Effect.map((history) => ({ source, history })),
        ),
      ),
      { concurrency: "unbounded", mode: "result" },
    )

    yield* Option.match(EffectArray.head(EffectArray.getFailures(historyResults)), {
      onNone: () => Effect.void,
      onSome: (failure) =>
        Effect.logError("Failed parsing a vegetable's history: ", failure.message),
    })

    const fs = yield* FileSystem.FileSystem
    const path = yield* Path.Path
    const vegetablesDirectory = path.join(import.meta.dirname, "..", "debug", "vegetables")
    yield* fs.makeDirectory(vegetablesDirectory, { recursive: true })

    yield* Effect.forEach(
      EffectArray.getSuccesses(historyResults),
      ({ source, history }) =>
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
                    content: Schema.decodeUnknownSync(Schema.Option(TiptapDocument))(
                      historyEntry.state.content,
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
            history: historyEntries,
          })
          const encoded = yield* Schema.encodeEffect(
            Schema.fromJsonString(VegetableDataForMigration, { space: 2 }),
          )(data)
          yield* fs.writeFileString(
            path.join(vegetablesDirectory, `${source.handle}.json`),
            encoded,
          )
        }),
      { concurrency: 1 },
    )
  }),
).pipe(Command.withDescription("Fetch vegetables and reconstruct their Gel history"))
