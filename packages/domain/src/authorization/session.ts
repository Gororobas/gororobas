import { Context, Effect, HashSet, Predicate, Record, Schema } from "effect"
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
export const getSessionPlatformPermissions = (
  session: Session,
): HashSet.HashSet<PlatformPermission> =>
  session.type === "VISITOR"
    ? platformPermissionsFor("VISITOR")
    : platformPermissionsFor(session.accessLevel)

export const getSessionOrganizationPermissions = (
  session: AccountSession,
): Record<OrganizationId, HashSet.HashSet<OrganizationPermission>> =>
  Record.fromEntries(
    session.memberships.map((m) => [m.organizationId, organizationPermissionsFor(m.accessLevel)]),
  )

export const Session = Schema.Union([VisitorSession, AccountSession])
export type Session = typeof Session.Type

/**
 * The session of whoever is making the request, read when something first needs it.
 *
 * The server resolves roles and memberships from the database on demand, and again inside each
 * transaction, under its lock: a write is authorized by the roles it commits with, and a demotion
 * that commits first denies it. `fixed` serves a session that's already known.
 *
 * @effect-leakable-service
 */
export class SessionContext extends Context.Service<
  SessionContext,
  { readonly current: Effect.Effect<Session> }
>()("Session") {
  static fixed(session: Session) {
    return SessionContext.of({ current: Effect.succeed(session) })
  }
}

export const currentSession: Effect.Effect<Session, never, SessionContext> = SessionContext.use(
  (context) => context.current,
)

export const provideSession =
  (session: Session) =>
  <A, E, R>(effect: Effect.Effect<A, E, R>): Effect.Effect<A, E, Exclude<R, SessionContext>> =>
    Effect.provideService(effect, SessionContext, SessionContext.fixed(session))

export class UnauthorizedError extends Schema.TaggedError<UnauthorizedError>()(
  "UnauthorizedError",
  {
    message: Schema.optional(Schema.String),
    session: Session,
  },
  { httpApiStatus: 403 },
) {
  static is(u: unknown): u is UnauthorizedError {
    return Predicate.isTagged(u, "UnauthorizedError")
  }
}
