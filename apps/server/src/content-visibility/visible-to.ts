import {
  getSessionOrganizationPermissions,
  type OrganizationId,
  type OrganizationPermission,
  type Session,
  TrustedAccessLevel,
} from "@gororobas/domain"
import { Array as EffectArray, HashSet, Record, Schema } from "effect"
import type { SqlClient } from "effect/sql/SqlClient"

/**
 * `canViewContent` as a SQL condition on a row's owner, visibility and moderation status columns,
 * so queries filter and paginate visible content in the database. A property test checks that both
 * agree for any session and content.
 *
 * Column names are inlined, so they must be column references written in code, never input.
 */
export const visibleTo = (
  sql: SqlClient,
  input: {
    session: Session
    ownerProfileId: string
    visibility: string
    moderationStatus: string
  },
) => {
  const account = input.session.type === "ACCOUNT" ? input.session : undefined
  const isTrusted = account !== undefined && Schema.is(TrustedAccessLevel)(account.accessLevel)
  const isReviewer = account?.accessLevel === "ADMIN" || account?.accessLevel === "MODERATOR"

  // Organization permissions only apply to people with community access.
  const organizationsWith = (permission: OrganizationPermission): ReadonlyArray<OrganizationId> =>
    account !== undefined && isTrusted
      ? Record.toEntries(getSessionOrganizationPermissions(account))
          .filter(([, permissions]) => HashSet.has(permissions, permission))
          .map(([organizationId]) => organizationId)
      : []

  const owner = sql.literal(input.ownerProfileId)
  const visibility = sql.literal(input.visibility)
  const flag = (value: boolean) => sql.literal(value ? "1" : "0")
  const isOwner = account === undefined ? flag(false) : sql`${owner} = ${account.personId}`

  const ownedByOneOf = (organizationIds: ReadonlyArray<OrganizationId>) =>
    EffectArray.match(organizationIds, {
      onEmpty: () => flag(false),
      onNonEmpty: (ids) => sql`${owner} IN ${sql.in(ids)}`,
    })

  return sql`(CASE
    WHEN ${sql.literal(input.moderationStatus)} = 'CENSORED'
      THEN ${isOwner} OR ${ownedByOneOf(organizationsWith("publications:edit"))}
    WHEN EXISTS (
      SELECT 1 FROM people unapproved
      WHERE unapproved.id = ${owner} AND unapproved.access_level IN ('NEWCOMER', 'BLOCKED')
    ) THEN ${isOwner} OR ${flag(isReviewer)}
    ELSE ${isOwner} OR ${visibility} = 'PUBLIC' OR (${visibility} = 'COMMUNITY' AND ${flag(isTrusted)})
      OR ${ownedByOneOf(organizationsWith("publications:view"))}
  END)`
}

/** `visibleTo` for `publication_sources` rows, under the `source` alias. */
export const publicationVisibleTo = (sql: SqlClient, session: Session) =>
  visibleTo(sql, {
    session,
    ownerProfileId: "source.owner_profile_id",
    visibility: "source.visibility",
    moderationStatus: "source.moderation_status",
  })
