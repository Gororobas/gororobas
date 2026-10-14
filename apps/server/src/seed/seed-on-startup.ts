import { Config, Effect, Layer, Option } from "effect"

import {
  countTableRows,
  DEFAULT_SEED,
  defaultSeedAnchor,
  SeedScale,
  seedDatabase,
} from "./seed-database.js"

/**
 * Seeds the application database while the server starts when `SEED_SCALE` is set and the
 * database has no profiles. Combined with `APP_DB_FILENAME=:memory:`, every start gets a
 * fresh, populated database.
 */
export const SeedOnStartupLive = Layer.effectDiscard(
  Effect.gen(function* () {
    const scale = yield* Config.schema(SeedScale, "SEED_SCALE").pipe(Config.option)
    if (Option.isNone(scale)) return

    const tables = yield* countTableRows
    if ((tables.profiles ?? 0) > 0) {
      return yield* Effect.log("SEED_SCALE is set, but the database has data; skipping seeding")
    }

    const report = yield* seedDatabase({
      scale: scale.value,
      seed: yield* Config.String("SEED").pipe(Config.withDefault(DEFAULT_SEED)),
      anchor: yield* defaultSeedAnchor,
    })

    yield* Effect.log(
      `Seeded a ${report.scale} database. Sign in as ${report.personas.map((persona) => persona.email).join(", ")}`,
    )
  }),
)
