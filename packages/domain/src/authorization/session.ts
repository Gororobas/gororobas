import { Predicate, Schema, ServiceMap } from "effect"
/**
 * Session types for authentication.
 */

import { OrganizationAccessLevel, PlatformAccessLevel } from "../common/enums.js"
import { OrganizationId, PersonId } from "../common/ids.js"
import {
  organizationPermissionsFor,
  type OrganizationPermission,
  platformPermissionsFor,
  type PlatformPermission,
} from "./permissions.js"

export const VisitorSession = Schema.Struct({
  type: Schema.Literal("VISITOR"),
})
export type VisitorSession = typeof VisitorSession.Type

export const OrganizationMembershipSession = Schema.Struct({
  accessLevel: OrganizationAccessLevel,
  organizationId: OrganizationId,
})
export type OrganizationMembershipSession = typeof OrganizationMembershipSession.Type

export const AccountSession = Schema.Struct({
  accessLevel: PlatformAccessLevel,
  memberships: Schema.Array(OrganizationMembershipSession),
  personId: PersonId,
  type: Schema.Literal("ACCOUNT"),
})
export type AccountSession = typeof AccountSession.Type

export const isAccountSession = (session: Session): session is AccountSession =>
  session.type === "ACCOUNT"

/** Get platform permissions for a session */
export const getSessionPlatformPermissions = (session: Session): ReadonlySet<PlatformPermission> =>
  session.type === "VISITOR"
    ? platformPermissionsFor("VISITOR")
    : platformPermissionsFor(session.accessLevel)

export const getSessionOrganizationPermissions = (
  session: AccountSession,
): Record<OrganizationId, ReadonlySet<OrganizationPermission>> =>
  Object.fromEntries(
    session.memberships.map((m) => [m.organizationId, organizationPermissionsFor(m.accessLevel)]),
  ) as Record<OrganizationId, ReadonlySet<OrganizationPermission>>

export const Session = Schema.Union([VisitorSession, AccountSession])
export type Session = typeof Session.Type

export class SessionContext extends ServiceMap.Service<SessionContext, Session>()("Session") {}

export class UnauthorizedError extends Schema.TaggedErrorClass<UnauthorizedError>()(
  "UnauthorizedError",
  {
    message: Schema.optional(Schema.String),
    session: Session,
  },
  { httpApiStatus: 403 },
) {
  static is(u: unknown): u is UnauthorizedError {
    return Predicate.isTagged(u, "Unauthorized")
  }
}
