import { Array as EffectArray, Effect, Option, Schema } from "effect"
import { Command } from "effect/unstable/cli"

import { GelClient } from "./gel-client.js"
import { gelVegetableToPlantEditableAttributes } from "./gel-vegetable-to-wiki-plant-article.js"
import { GelVegetableForConversion } from "./schemas/gel/entities.js"
import { reconstructGelVegetableHistory } from "./utils/backward-reconstruction.js"

const vegetablesQuery = `
  select Vegetable {
    *,
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
        Effect.flatMap((vegetables) =>
          Effect.all(
            vegetables.map((vegetable) =>
              Schema.decodeUnknownEffect(GelVegetableForConversion)(vegetable),
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
      vegetables.map(({ edit_suggestions, ...vegetable }) =>
        reconstructGelVegetableHistory(vegetable, edit_suggestions).pipe(
          Effect.map((history) => ({ vegetable, history })),
        ),
      ),
      { concurrency: "unbounded", mode: "result" },
    )

    const histories = EffectArray.getSuccesses(historyResults)
    yield* Effect.log(
      "GelVegetable history summary",
      histories
        .map(({ vegetable, history }) => ({
          handle: vegetable.handle,
          mergedEdits: history.edits.length,
          versions: history.versions.length,
        }))
        .filter(({ mergedEdits }) => mergedEdits > 0),
    )
    yield* Option.match(EffectArray.head(histories), {
      onNone: () => Effect.void,
      onSome: ({ vegetable }) =>
        Effect.log("Example plant attributes", gelVegetableToPlantEditableAttributes(vegetable)),
    })

    yield* Option.match(EffectArray.head(EffectArray.getFailures(historyResults)), {
      onNone: () => Effect.void,
      onSome: (failure) =>
        Effect.logError("Failed parsing a vegetable's history: ", failure.message),
    })
  }),
).pipe(Command.withDescription("Fetch vegetables and reconstruct their Gel history"))
