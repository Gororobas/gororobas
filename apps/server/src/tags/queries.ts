import { TagId, TagRow } from "@gororobas/domain"
import { Effect, Schema } from "effect"
import { SqlClient, SqlSchema } from "effect/sql"

export const findById = SqlSchema.findOneOption({
  Request: TagId,
  Result: TagRow,
  execute: (id) =>
    Effect.gen(function* () {
      const sql = yield* SqlClient.SqlClient

      return yield* sql`SELECT * FROM tags WHERE id = ${id}`
    }),
})

export const findByHandle = SqlSchema.findOneOption({
  execute: (handle) =>
    Effect.gen(function* () {
      const sql = yield* SqlClient.SqlClient

      return yield* sql`SELECT * FROM tags WHERE handle = ${handle}`
    }),
  Request: Schema.String,
  Result: TagRow,
})

export const findAll = SqlSchema.findAll({
  execute: () =>
    Effect.gen(function* () {
      const sql = yield* SqlClient.SqlClient

      return yield* sql`SELECT * FROM tags ORDER BY handle`
    }),
  Request: Schema.Void,
  Result: TagRow,
})

export const findByName = SqlSchema.findOneOption({
  execute: (pattern) =>
    Effect.gen(function* () {
      const sql = yield* SqlClient.SqlClient

      return yield* sql`
        SELECT id, handle FROM tags
        WHERE LOWER(names) LIKE ${pattern}
        LIMIT 1
      `
    }),
  Request: Schema.String,
  Result: Schema.Struct({
    id: TagId,
    handle: Schema.String,
  }),
})
