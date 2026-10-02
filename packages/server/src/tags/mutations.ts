import { TagRow } from "@gororobas/domain"
import { Effect } from "effect"
import { SqlClient, SqlSchema } from "effect/unstable/sql"

export const insertRow = SqlSchema.void({
  Request: TagRow,
  execute: (tag) =>
    Effect.gen(function* () {
      const sql = yield* SqlClient.SqlClient

      return yield* sql`INSERT INTO tags ${sql.insert(tag)}`
    }),
})
