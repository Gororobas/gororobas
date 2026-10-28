import * as Layer from "effect/Layer"
import * as Migrator from "effect/sql/Migrator"
import type * as Client from "effect/sql/SqlClient"
import type { SqlError } from "effect/sql/SqlError"

export * from "effect/sql/Migrator"

export const run = Migrator.make({})

export const layer = <R>(
  options: Migrator.MigratorOptions<R>,
): Layer.Layer<never, Migrator.MigrationError | SqlError, Client.SqlClient | R> =>
  Layer.effectDiscard(run(options))
