import { PersonRow } from "@gororobas/domain"
import { Effect } from "effect"
import { SqlClient, SqlSchema } from "effect/unstable/sql"

export const updateRow = SqlSchema.void({
  Request: PersonRow,
  execute: ({ id, ...update }) =>
    Effect.gen(function* () {
      const sql = yield* SqlClient.SqlClient
      return yield* sql`UPDATE people SET ${sql.update(update)} WHERE id = ${id};`
    }),
})

export const insertRow = SqlSchema.void({
  Request: PersonRow,
  execute: (person) =>
    Effect.gen(function* () {
      const sql = yield* SqlClient.SqlClient
      return yield* sql`INSERT INTO people ${sql.insert(person)}`
    }),
})
