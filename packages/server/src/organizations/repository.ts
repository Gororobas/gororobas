import {
  OrganizationId,
  OrganizationMembershipRow,
  OrganizationRow,
  PersonId,
  SoleManagerOrganizationMetadata,
} from "@gororobas/domain"
import { Effect, Schema, ServiceMap } from "effect"
import { SqlClient, SqlSchema } from "effect/unstable/sql"

const MembershipKey = Schema.Struct({
  organizationId: OrganizationId,
  personId: PersonId,
})

export class OrganizationsRepository extends ServiceMap.Service<OrganizationsRepository>()(
  "OrganizationsRepository",
  {
    make: Effect.gen(function* () {
      const sql = yield* SqlClient.SqlClient

      const findById = SqlSchema.findOneOption({
        Request: OrganizationId,
        Result: OrganizationRow,
        execute: (id) => sql`SELECT * FROM organizations WHERE id = ${id}`,
      })

      const insertRow = SqlSchema.void({
        Request: OrganizationRow,
        execute: (organization) => sql`
          INSERT INTO organizations ${sql.insert(organization)}
        `,
      })

      const updateRow = SqlSchema.void({
        Request: OrganizationRow,
        execute: ({ id, ...update }) => sql`
          UPDATE organizations
          SET ${sql.update(update)}
          WHERE id = ${id}
        `,
      })

      const deleteRow = SqlSchema.void({
        Request: OrganizationId,
        execute: (id) => sql`DELETE FROM organizations WHERE id = ${id}`,
      })

      const findMembership = SqlSchema.findOneOption({
        Request: MembershipKey,
        Result: OrganizationMembershipRow,
        execute: ({ organizationId, personId }) => sql`
          SELECT * FROM organization_memberships
          WHERE organization_id = ${organizationId}
            AND person_id = ${personId}
        `,
      })

      const listMembers = SqlSchema.findAll({
        Request: OrganizationId,
        Result: OrganizationMembershipRow,
        execute: (organizationId) => sql`
          SELECT *
          FROM organization_memberships
          WHERE organization_id = ${organizationId}
        `,
      })

      const insertMembership = SqlSchema.void({
        Request: OrganizationMembershipRow,
        execute: (membership) => sql`
          INSERT INTO organization_memberships ${sql.insert(membership)}
        `,
      })

      const updateMembership = SqlSchema.void({
        Request: OrganizationMembershipRow,
        execute: ({ organizationId, personId, ...update }) => sql`
          UPDATE organization_memberships
          SET ${sql.update(update)}
          WHERE organization_id = ${organizationId}
            AND person_id = ${personId}
        `,
      })

      const deleteMembership = SqlSchema.void({
        Request: MembershipKey,
        execute: ({ organizationId, personId }) => sql`
          DELETE FROM organization_memberships
          WHERE organization_id = ${organizationId}
            AND person_id = ${personId}
        `,
      })

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
        deleteRow,
        deleteMembership,
        findById,
        findMembership,
        findOrganizationsWhereSoleManager,
        insertMembership,
        insertRow,
        listMembers,
        updateMembership,
        updateRow,
      } as const
    }),
  },
) {}
