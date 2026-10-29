/**
 * Seeds the application database file selected by `APP_DB_FILENAME`.
 *
 * pnpm --filter @gororobas/server seed --scale medium --replace
 */
import { NodeRuntime, NodeServices } from "@effect/platform-node"
import {
  Array as EffectArray,
  Config,
  Console,
  DateTime,
  Effect,
  FileSystem,
  Option,
  Path,
  Schema,
} from "effect"
import { Command, Flag } from "effect/cli"

import { makeAppSql } from "../sql.js"
import { DEFAULT_SEED, defaultSeedAnchor, SeedScale, seedDatabase } from "./seed-database.js"

export class SeedTargetInUseError extends Schema.TaggedError<SeedTargetInUseError>()(
  "SeedTargetInUseError",
  { database: Schema.String },
) {
  override get message() {
    return `Stop the server before seeding ${this.database}; SQLite sidecars are present`
  }
}

const seed = Command.make(
  "seed",
  {
    scale: Flag.Literals("scale", SeedScale.literals).pipe(
      Flag.withDefault("small"),
      Flag.withDescription("How much data to create: tiny, small, medium or large."),
    ),
    seed: Flag.String("seed").pipe(
      Flag.withDefault(DEFAULT_SEED),
      Flag.withDescription("Any string; the same seed, scale and anchor produce the same data."),
    ),
    anchor: Flag.Date("anchor").pipe(
      Flag.optional,
      Flag.withDescription("The seed's present moment. Defaults to the start of today (UTC)."),
    ),
    replace: Flag.Boolean("replace").pipe(
      Flag.withDefault(false),
      Flag.withDescription("Delete the existing database file before seeding."),
    ),
  },
  (flags) =>
    Effect.gen(function* () {
      const fileSystem = yield* FileSystem.FileSystem
      const path = yield* Path.Path
      const database = path.resolve(
        yield* Config.String("APP_DB_FILENAME").pipe(Config.withDefault("gororobas.db")),
      )

      const sidecars = yield* Effect.filter(
        [`${database}-wal`, `${database}-shm`],
        (sidecar) => fileSystem.exists(sidecar),
        { concurrency: 1 },
      )

      if (EffectArray.isReadonlyArrayNonEmpty(sidecars)) {
        return yield* new SeedTargetInUseError({ database })
      }

      if (flags.replace && (yield* fileSystem.exists(database))) {
        yield* fileSystem.remove(database)
      }

      const report = yield* seedDatabase({
        scale: flags.scale,
        seed: flags.seed,
        anchor: Option.isSome(flags.anchor)
          ? DateTime.fromDateUnsafe(flags.anchor.value)
          : yield* defaultSeedAnchor,
      }).pipe(Effect.provide(makeAppSql(database)))

      yield* Console.log(
        yield* Schema.encodeEffect(Schema.fromJsonString(Schema.Unknown, { space: 2 }))({
          database,
          ...report,
        }),
      )
    }),
).pipe(Command.withDescription("Populate an empty application database with legible fake data."))

seed.pipe(
  Command.run({ version: "0.0.0" }),
  Effect.provide(NodeServices.layer),
  NodeRuntime.runMain,
)
