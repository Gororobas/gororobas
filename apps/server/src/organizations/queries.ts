import {
  OrganizationId,
  OrganizationInvitationRow,
  Email,
  OrganizationMembershipRow,
  OrganizationRow,
  PersonId,
  SoleManagerOrganizationMetadata,
} from "@gororobas/domain"
import { Effect, Schema } from "effect"
import { SqlClient, SqlSchema } from "effect/sql"

const MembershipKey = Schema.Struct({ organizationId: OrganizationId, personId: PersonId })

export const findById = SqlSchema.findOneOption({
  Request: OrganizationId,
  Result: OrganizationRow,
  execute: (id) =>
    Effect.gen(function* () {
      const sql = yield* SqlClient.SqlClient
      return yield* sql`SELECT * FROM organizations WHERE id = ${id}`
    }),
})

export const findMembership = SqlSchema.findOneOption({
  Request: MembershipKey,
  Result: OrganizationMembershipRow,
  execute: ({ organizationId, personId }) =>
    Effect.gen(function* () {
      const sql = yield* SqlClient.SqlClient
      return yield* sql`SELECT * FROM organization_memberships WHERE organization_id = ${organizationId} AND person_id = ${personId}`
    }),
})

export const listMembers = SqlSchema.findAll({
  Request: OrganizationId,
  Result: OrganizationMembershipRow,
  execute: (organizationId) =>
    Effect.gen(function* () {
      const sql = yield* SqlClient.SqlClient
      return yield* sql`SELECT * FROM organization_memberships WHERE organization_id = ${organizationId}`
    }),
})

export const findOrganizationsWhereSoleManager = SqlSchema.findAll({
  Request: PersonId,
  Result: SoleManagerOrganizationMetadata,
  execute: (personId) =>
    Effect.gen(function* () {
      const sql = yield* SqlClient.SqlClient

      return yield* sql`
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
    `
    }),
})

export const findInvitation = SqlSchema.findOneOption({
  Request: Schema.Struct({ organizationId: OrganizationId, email: Email }),
  Result: OrganizationInvitationRow,
  execute: ({ organizationId, email }) =>
    SqlClient.SqlClient.use(
      (sql) =>
        sql`SELECT * FROM organization_invitations WHERE organization_id = ${organizationId} AND email = ${email}`,
    ),
})

export const findPersonEmail = SqlSchema.findOneOption({
  Request: PersonId,
  Result: Schema.Struct({ email: Email }),
  execute: (personId) =>
    SqlClient.SqlClient.use(
      (sql) =>
        sql`SELECT auth_subjects.email FROM auth_subjects INNER JOIN people ON people.id = auth_subjects.id WHERE people.id = ${personId}`,
    ),
})

export const listInvitations = SqlSchema.findAll({
  Request: OrganizationId,
  Result: OrganizationInvitationRow,
  execute: (organizationId) =>
    SqlClient.SqlClient.use(
      (sql) =>
        sql`SELECT * FROM organization_invitations WHERE organization_id = ${organizationId} ORDER BY id`,
    ),
})
