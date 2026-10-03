/**
 * SQL client and migrator for application-level data.
 */
import { NodeServices } from "@effect/platform-node"
import { SqliteClient, SqliteMigrator } from "@effect/sql-sqlite-node"
import { Effect, Layer } from "effect"
import { SqlClient } from "effect/sql"

import { migrations } from "./db/migrations-effect/index.js"

const snakeToCamel = (str: string) => str.replace(/_([a-z])/g, (_, letter) => letter.toUpperCase())
const camelToSnake = (str: string) => str.replace(/[A-Z]/g, (letter) => `_${letter.toLowerCase()}`)

export const makeAppSqlClient = (filename: string, readonly = false) =>
  SqliteClient.layer({
    filename,
    readonly,
    // Transform column names automatically
    transformResultNames: snakeToCamel, // DB → JS (snake_case → camelCase)
    transformQueryNames: camelToSnake, // JS → DB (camelCase → snake_case)
    // Add span attributes for telemetry
    spanAttributes: {
      "db.system": "sqlite",
    },
  })

export const makeAppSql = (filename: string) => {
  const client = makeAppSqlClient(filename)
  // SQLite ignores foreign_keys changes inside the migrator's transaction.
  // Atlas rebuilds tables, so disable enforcement before entering that transaction.
  const migrate = Layer.effectDiscard(
    Effect.gen(function* () {
      const sql = yield* SqlClient.SqlClient
      yield* sql`PRAGMA foreign_keys = OFF`
      yield* SqliteMigrator.run({ loader: SqliteMigrator.fromRecord(migrations) })
      const violations = yield* sql`PRAGMA foreign_key_check`
      if (violations.length > 0)
        return yield* Effect.die(new Error("Migration left foreign key violations"))
      yield* sql`PRAGMA foreign_keys = ON`
    }),
  ).pipe(Layer.provide(NodeServices.layer))
  return migrate.pipe(Layer.provideMerge(client))
}

export const AppSqlLive = makeAppSql("gororobas.db")
export const AppSqlTest = makeAppSql(":memory:")
