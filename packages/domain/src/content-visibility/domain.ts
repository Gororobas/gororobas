/**
 * Who can see a publication, and the media and comments that follow it.
 *
 * `canViewContent` is the rule. The server's `visibleTo` SQL fragment applies the same rule inside
 * queries, so searches can filter and paginate in the database; a property test checks that the
 * two agree.
 */
import { HashSet, Schema } from "effect"

import type { OrganizationPermission } from "../authorization/permissions.js"
import {
  type AccountSession,
  getSessionOrganizationPermissions,
  type Session,
} from "../authorization/session.js"
import {
  ModerationStatus,
  PlatformAccessLevel,
  PublicationVisibility,
  TrustedAccessLevel,
} from "../common/enums.js"
import { OrganizationId, PersonId } from "../common/ids.js"

/** A person owner carries their access level: newcomers' content waits for their approval. */
export const ContentOwner = Schema.Union([
  Schema.Struct({ type: Schema.Literal("PERSON"), id: PersonId, accessLevel: PlatformAccessLevel }),
  Schema.Struct({ type: Schema.Literal("ORGANIZATION"), id: OrganizationId }),
])
export type ContentOwner = typeof ContentOwner.Type

export const ViewableContent = Schema.Struct({
  owner: ContentOwner,
  visibility: PublicationVisibility,
  moderationStatus: ModerationStatus,
})

export type ViewableContent = typeof ViewableContent.Type

/** Organization permissions only apply to people with community access. */
const hasOrganizationPermission = ({
  session,
  owner,
  permission,
}: {
  session: AccountSession
  owner: ContentOwner
  permission: OrganizationPermission
}) =>
  Schema.is(TrustedAccessLevel)(session.accessLevel) &&
  owner.type === "ORGANIZATION" &&
  HashSet.has(getSessionOrganizationPermissions(session)[owner.id] ?? HashSet.empty(), permission)

/**
 * - Censored content is hidden from everyone but its authors: the person who owns it, or the
 *   organization members who can edit it.
 * - Newcomers' content is only visible to them and to moderators until they're approved.
 * - Otherwise, public content is visible to anyone, community content to people with community
 *   access, and organization content to its members.
 */
export const canViewContent = (session: Session, content: ViewableContent): boolean => {
  const { owner } = content
  const account = session.type === "ACCOUNT" ? session : undefined
  const isOwner = owner.type === "PERSON" && owner.id === account?.personId
  const can = (permission: OrganizationPermission) =>
    account !== undefined && hasOrganizationPermission({ session: account, owner, permission })

  if (content.moderationStatus === "CENSORED") return isOwner || can("publications:edit")

  if (owner.type === "PERSON" && owner.accessLevel === "NEWCOMER") {
    return isOwner || account?.accessLevel === "ADMIN" || account?.accessLevel === "MODERATOR"
  }

  return (
    isOwner ||
    content.visibility === "PUBLIC" ||
    (content.visibility === "COMMUNITY" && Schema.is(TrustedAccessLevel)(account?.accessLevel)) ||
    can("publications:view")
  )
}
