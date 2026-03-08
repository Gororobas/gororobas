/**
 * SQL client and migrator for application-level data.
 */
import { BunServices } from "@effect/platform-bun"
import { SqliteClient, SqliteMigrator } from "@effect/sql-sqlite-bun"
import { Layer } from "effect"

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

  const migrator = SqliteMigrator.layer({
    loader: SqliteMigrator.fromRecord(migrations),
  }).pipe(Layer.provide(BunServices.layer))
  return migrator.pipe(Layer.provideMerge(client))
}

export const AppSqlLive = makeAppSql("gororobas.db")
export const AppSqlTest = makeAppSql(":memory:")
