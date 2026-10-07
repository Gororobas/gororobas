import { PersonId, PersonRow } from "@gororobas/domain"
import { Effect, Schema } from "effect"
import { SqlClient, SqlSchema } from "effect/sql"

export const findById = SqlSchema.findOneOption({
  Request: PersonId,
  Result: PersonRow,
  execute: (id) =>
    Effect.gen(function* () {
      const sql = yield* SqlClient.SqlClient
      return yield* sql`SELECT * FROM people WHERE id = ${id}`
    }),
})

export const countOtherAdministrators = SqlSchema.findOne({
  Request: PersonId,
  Result: Schema.Struct({ count: Schema.Number }),
  execute: (personId) =>
    SqlClient.SqlClient.use(
      (sql) => sql`
    SELECT COUNT(*) AS count FROM people WHERE access_level = 'ADMIN' AND id != ${personId}
  `,
    ),
})
