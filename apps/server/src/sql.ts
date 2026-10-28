/**
 * SQL client and migrator for application-level data.
 */
import { NodeServices } from "@effect/platform-node"
import { TursoClient, TursoMigrator } from "@gororobas/effect-sql-turso"
import { Array as EffectArray, Config, Effect, Layer, String as EffectString } from "effect"
import { SqlClient } from "effect/sql"

import { migrations } from "./db/migrations-effect/index.js"

export const appSqlClientConfig = (filename: string, options: { readonly?: boolean } = {}) => ({
  filename,
  readonly: options.readonly ?? false,
  // Transform column names automatically
  transformResultNames: EffectString.snakeToCamel, // DB → JS (snake_case → camelCase)
  transformQueryNames: EffectString.camelToSnake, // JS → DB (camelCase → snake_case)
  // Add span attributes for telemetry
  spanAttributes: {
    "db.system": "sqlite",
  },
})

export const makeAppSqlClient = (filename: string, options: { readonly?: boolean } = {}) =>
  TursoClient.layer(appSqlClientConfig(filename, options))

// SQLite ignores foreign_keys changes inside the migrator's transaction.
// Atlas rebuilds tables, so disable enforcement before entering that transaction.
export const AppSqlMigrations = Layer.effectDiscard(
  Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient
    yield* sql`PRAGMA foreign_keys = OFF`
    yield* TursoMigrator.run({ loader: TursoMigrator.fromRecord(migrations) })
    const violations = yield* sql`PRAGMA foreign_key_check`
    if (EffectArray.isReadonlyArrayNonEmpty(violations)) {
      return yield* Effect.die("Migration left foreign key violations")
    }
    yield* sql`PRAGMA foreign_keys = ON`
  }),
).pipe(Layer.provide(NodeServices.layer))

export const makeAppSql = (filename: string) =>
  AppSqlMigrations.pipe(Layer.provideMerge(makeAppSqlClient(filename)))

export const AppSqlLive = Layer.unwrap(
  Effect.map(Config.String("APP_DB_FILENAME").pipe(Config.withDefault("gororobas.db")), makeAppSql),
)

export const AppSqlTest = makeAppSql(":memory:")
