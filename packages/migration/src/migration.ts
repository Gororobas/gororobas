import { Array as EffectArray, Effect, Option, Schema } from "effect"
import { Command } from "effect/unstable/cli"

import { GelClient } from "./gel-client.js"
import { VegetableInGel } from "./schemas/gel/entities.js"

export const migrate = Command.make("migrate", {}, () =>
  Effect.gen(function* () {
    const gelClient = yield* GelClient
    const vegetableResults = yield* gelClient
      .use((client) => client.query("select Vegetable { * }"))
      .pipe(
        Effect.tap(Effect.logInfo),
        Effect.flatMap((vegetables) =>
          Effect.all(
            vegetables.map((v) => Schema.decodeUnknownEffect(VegetableInGel)(v)),
            {
              concurrency: "unbounded",
              mode: "result",
            },
          ),
        ),
      )

    const vegetables = EffectArray.getSuccesses(vegetableResults)
    yield* Option.match(EffectArray.head(vegetables), {
      onNone: () => Effect.void,
      onSome: (vegetable) => Effect.log("Example vegetable", vegetable),
    })

    const failures = EffectArray.getFailures(vegetableResults)
    yield* Option.match(EffectArray.head(failures), {
      onNone: () => Effect.void,
      onSome: (failure) => Effect.log(failure.message),
    })
  }),
).pipe(Command.withDescription("Fetch vegetables from Gel"))
