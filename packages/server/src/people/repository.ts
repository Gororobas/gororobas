import { PersonId, PersonRow, ProfileId, SoleManagerOrganizationMetadata } from "@gororobas/domain"
import { Effect } from "effect"
import { SqlClient, SqlSchema } from "effect/unstable/sql"

export class PeopleRepository extends Effect.Service<PeopleRepository>()("PeopleRepository", {
  effect: Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient

    const findById = SqlSchema.findOne({
      Request: ProfileId,
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

    const findOrganizationsWhereSoleManager = SqlSchema.findAll({
      Request: PersonId,
      Result: SoleManagerOrganizationMetadata,
      execute: (personId) => sql`
        SELECT
          om.organization_id AS organizationId,
          COUNT(*) AS memberCount
        FROM organization_memberships om
        WHERE om.person_id = ${personId}
          AND om.access_level = 'MANAGER'
          AND NOT EXISTS (
            SELECT 1
            FROM organization_memberships om2
            WHERE om2.organization_id = om.organization_id
              AND om2.access_level = 'MANAGER'
              AND om2.person_id != ${personId}
          )
        GROUP BY om.organization_id
      `,
    })

    return {
      findById,
      updateRow,
      findOrganizationsWhereSoleManager,
    } as const
  }),
}) {}
