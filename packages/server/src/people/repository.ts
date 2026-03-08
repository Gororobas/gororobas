import { PersonId, PersonRow } from "@gororobas/domain"
import { Effect, ServiceMap } from "effect"
import { SqlClient, SqlSchema } from "effect/unstable/sql"

export class PeopleRepository extends ServiceMap.Service<PeopleRepository>()("PeopleRepository", {
  make: Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient

    const findById = SqlSchema.findOneOption({
      Request: PersonId,
      Result: PersonRow,
      execute: (id) => sql`SELECT * FROM people WHERE id = ${id}`,
    })

    const updateRow = SqlSchema.void({
      Request: PersonRow,
      execute: ({ id, ...update }) => sql`
        UPDATE people
        SET ${sql.update(update)}
        WHERE id = ${id};`,
    })

    const insertRow = SqlSchema.void({
      Request: PersonRow,
      execute: (person) => sql`
        INSERT INTO people ${sql.insert(person)}
      `,
    })

    return {
      findById,
      updateRow,
      insertRow,
    } as const
  }),
}) {}
