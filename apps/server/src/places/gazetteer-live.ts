import { Config, Effect, FileSystem, Layer, Option } from "effect"

import { GazetteerFixture } from "./gazetteer-fixture.js"
import { GazetteerFromSql, makeGazetteerSql } from "./gazetteer.js"

/** Where `pnpm --filter @gororobas/server gazetteer:build` writes the gazetteer by default. */
const BUILT_GAZETTEER = "data/gazetteer.db"

/**
 * The gazetteer at `GAZETTEER_DB_FILENAME`, or the one `gazetteer:build` wrote. Without either, a
 * small fixture keeps a fresh checkout (and the seeded API) running.
 */
export const GazetteerLive = Layer.unwrap(
  Effect.gen(function* () {
    const configured = yield* Config.String("GAZETTEER_DB_FILENAME").pipe(Config.option)
    if (Option.isSome(configured)) {
      return GazetteerFromSql.pipe(Layer.provide(makeGazetteerSql(configured.value)))
    }
    if (yield* (yield* FileSystem.FileSystem).exists(BUILT_GAZETTEER)) {
      return GazetteerFromSql.pipe(Layer.provide(makeGazetteerSql(BUILT_GAZETTEER)))
    }
    yield* Effect.logWarning(
      "No gazetteer built: using the fixture, with a dozen places. Build the real one with `pnpm --filter @gororobas/server gazetteer:build --countries co,br`.",
    )
    return GazetteerFixture
  }),
)
