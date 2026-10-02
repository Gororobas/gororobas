import {
  OrganizationId,
  OrganizationMembershipRow,
  OrganizationRow,
  PersonId,
} from "@gororobas/domain"
import { Effect, Schema } from "effect"
import { SqlClient, SqlSchema } from "effect/unstable/sql"

export const insertRow = SqlSchema.void({
  Request: OrganizationRow,
  execute: (organization) =>
    Effect.gen(function* () {
      const sql = yield* SqlClient.SqlClient
      return yield* sql`INSERT INTO organizations ${sql.insert(organization)}`
    }),
})

export const updateRow = SqlSchema.void({
  Request: OrganizationRow,
  execute: ({ id, ...update }) =>
    Effect.gen(function* () {
      const sql = yield* SqlClient.SqlClient
      return yield* sql`UPDATE organizations SET ${sql.update(update)} WHERE id = ${id}`
    }),
})

export const deleteRow = SqlSchema.void({
  Request: OrganizationId,
  execute: (id) =>
    Effect.gen(function* () {
      const sql = yield* SqlClient.SqlClient
      return yield* sql`DELETE FROM organizations WHERE id = ${id}`
    }),
})

export const insertMembership = SqlSchema.void({
  Request: OrganizationMembershipRow,
  execute: (membership) =>
    Effect.gen(function* () {
      const sql = yield* SqlClient.SqlClient
      return yield* sql`INSERT INTO organization_memberships ${sql.insert(membership)}`
    }),
})

export const updateMembership = SqlSchema.void({
  Request: OrganizationMembershipRow,
  execute: ({ organizationId, personId, ...update }) =>
    Effect.gen(function* () {
      const sql = yield* SqlClient.SqlClient
      return yield* sql`UPDATE organization_memberships SET ${sql.update(update)} WHERE organization_id = ${organizationId} AND person_id = ${personId}`
    }),
})

export const deleteMembership = SqlSchema.void({
  Request: Schema.Struct({ organizationId: OrganizationId, personId: PersonId }),
  execute: ({ organizationId, personId }) =>
    Effect.gen(function* () {
      const sql = yield* SqlClient.SqlClient
      return yield* sql`DELETE FROM organization_memberships WHERE organization_id = ${organizationId} AND person_id = ${personId}`
    }),
})
