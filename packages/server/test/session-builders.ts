/**
 * Session builders for authentication testing.
 */
import type {
  AccountSession,
  OrganizationMembershipSession,
  PlatformAccessLevel,
  VisitorSession,
} from "@gororobas/domain"
import { PersonId } from "@gororobas/domain"

/**
 * Create a visitor session (unauthenticated user).
 *
 * Visitor sessions have minimal permissions and cannot perform authenticated actions.
 *
 * @example
 * ```typescript
 * const session = makeVisitorSession()
 * const result = yield* someEffect.pipe(withSession(session))
 * ```
 */
export const makeVisitorSession = (): VisitorSession => ({
  type: "VISITOR",
})

/**
 * Create an account session (authenticated user).
 *
 * Account sessions represent authenticated users with specific access levels
 * and optional organization memberships.
 *
 * @param personId - The person's unique identifier
 * @param accessLevel - Platform access level (defaults to COMMUNITY)
 * @param memberships - Organization memberships (defaults to empty array)
 *
 * @example
 * ```typescript
 * const session = makeAccountSession(personId, "COMMUNITY")
 * const result = yield* someEffect.pipe(withSession(session))
 * ```
 */
export const makeAccountSession = (
  personId: PersonId,
  accessLevel: PlatformAccessLevel = "COMMUNITY",
  memberships: OrganizationMembershipSession[] = [],
): AccountSession => ({
  type: "ACCOUNT",
  personId,
  accessLevel,
  memberships,
})

/**
 * Create an admin session.
 *
 * Admin sessions have the highest platform permissions and can perform
 * administrative actions like managing access levels.
 *
 * @param personId - The admin person's unique identifier
 * @param memberships - Organization memberships (defaults to empty array)
 *
 * @example
 * ```typescript
 * const session = makeAdminSession(personId)
 * const result = yield* adminOnlyEffect.pipe(withSession(session))
 * ```
 */
export const makeAdminSession = (
  personId: PersonId,
  memberships: OrganizationMembershipSession[] = [],
): AccountSession => makeAccountSession(personId, "ADMIN", memberships)

/**
 * Create a moderator session.
 *
 * Moderator sessions have elevated permissions for content moderation
 * and community management.
 *
 * @param personId - The moderator person's unique identifier
 * @param memberships - Organization memberships (defaults to empty array)
 *
 * @example
 * ```typescript
 * const session = makeModeratorSession(personId)
 * const result = yield* moderationEffect.pipe(withSession(session))
 * ```
 */
export const makeModeratorSession = (
  personId: PersonId,
  memberships: OrganizationMembershipSession[] = [],
): AccountSession => makeAccountSession(personId, "MODERATOR", memberships)
