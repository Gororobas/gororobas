import { PersonId, PersonRow } from "@gororobas/domain"
import { Effect } from "effect"
import { SqlClient, SqlSchema } from "effect/unstable/sql"

export const findById = SqlSchema.findOneOption({
  Request: PersonId,
  Result: PersonRow,
  execute: (id) =>
    Effect.gen(function* () {
      const sql = yield* SqlClient.SqlClient
      return yield* sql`SELECT * FROM people WHERE id = ${id}`
    }),
})
