import { PersistenceConfigurationError } from "@yielded/auth-persistence/Adapter";
import { Effect, Layer } from "effect";

/** Run Drizzle Kit output through the matching Drizzle driver. Loading files and
 * acquiring the database are deferred until the Layer is built. Drizzle owns the
 * migration journal and transaction; failed migrations prevent auth startup.
 */
export const drizzleMigrationsLayer =
  <Database, Options, E, R>(
    acquire: Effect.Effect<Database, never, R>,
    migrator: Effect.Effect<(database: Database, options: Options) => Effect.Effect<void, E>>,
  ) =>
  (options: Options) =>
    Layer.effectDiscard(
      Effect.gen(function* () {
        const database = yield* acquire;
        const migrate = yield* migrator;

        const migration = yield* Effect.try({
          try: () => migrate(database, options),
          catch: () =>
            PersistenceConfigurationError.make({
              reason: "Could not read Drizzle migrations; check the migration source and format",
            }),
        });

        yield* migration;
      }),
    );
