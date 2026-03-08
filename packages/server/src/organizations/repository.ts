import { PersonId, SoleManagerOrganizationMetadata } from "@gororobas/domain"
import { Effect, ServiceMap } from "effect"
import { SqlClient, SqlSchema } from "effect/unstable/sql"

export class OrganizationsRepository extends ServiceMap.Service<OrganizationsRepository>()(
  "OrganizationsRepository",
  {
    make: Effect.gen(function* () {
      const sql = yield* SqlClient.SqlClient

      const findOrganizationsWhereSoleManager = SqlSchema.findAll({
        Request: PersonId,
        Result: SoleManagerOrganizationMetadata,
        execute: (personId) => sql`
          SELECT
            om.organization_id AS organizationId,
            COUNT(members.person_id) AS memberCount
          FROM organization_memberships om
          INNER JOIN organization_memberships members
            ON members.organization_id = om.organization_id
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
        findOrganizationsWhereSoleManager,
      } as const
    }),
  },
) {}
