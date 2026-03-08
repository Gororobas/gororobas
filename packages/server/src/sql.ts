/**
 * SQL client and migrator for application-level data.
 */
import { BunServices } from "@effect/platform-bun"
import { SqliteClient, SqliteMigrator } from "@effect/sql-sqlite-bun"
import { Effect, Layer } from "effect"
import { SqlClient } from "effect/unstable/sql"

import { migrations } from "./db/migrations-effect/index.js"

const snakeToCamel = (str: string) => str.replace(/_([a-z])/g, (_, letter) => letter.toUpperCase())
const camelToSnake = (str: string) => str.replace(/[A-Z]/g, (letter) => `_${letter.toLowerCase()}`)

const makeAppSql = (filename: string | ":memory:") => {
  const client = SqliteClient.layer({
    filename,
    // Transform column names automatically
    transformResultNames: snakeToCamel, // DB → JS (snake_case → camelCase)
    transformQueryNames: camelToSnake, // JS → DB (camelCase → snake_case)
    // Add span attributes for telemetry
    spanAttributes: {
      "db.system": "sqlite",
    },
  })
  const clientWithPragmas = Layer.effectDiscard(
    Effect.gen(function* () {
      const sql = yield* SqlClient.SqlClient
      yield* sql`PRAGMA foreign_keys = ON`
    }),
  ).pipe(Layer.provideMerge(client))

  const migrator = SqliteMigrator.layer({
    loader: SqliteMigrator.fromRecord(migrations),
  }).pipe(Layer.provide(BunServices.layer))
  return migrator.pipe(Layer.provideMerge(clientWithPragmas))
}

export const AppSqlLive = makeAppSql("gororobas.db")
export const AppSqlTest = makeAppSql(":memory:")
