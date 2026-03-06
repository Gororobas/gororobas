/**
 * Policy utilities for authorization checks.
 */
import { Effect, Result, Schema } from "effect"

import { TrustedAccessLevel } from "../common/enums.js"
import { OrganizationId } from "../common/ids.js"
import type { OrganizationPermission, PlatformPermission } from "./permissions.js"
import {
  type AccountSession,
  getSessionOrganizationPermissions,
  getSessionPlatformPermissions,
  isAccountSession,
  type Session,
  SessionContext,
  UnauthorizedError,
} from "./session.js"

/**
 * Policies are evaluated against the current session.
 *
 * Policies can assert data about the session or its inputs to provide with type narrowing.
 *
 * @example
 * const assertTrustedPerson: AssertionPolicy<TrustedPerson>
 * const trustedPerson = yield* assertTrustedPerson
 */
type Policy<A, R = never> = Effect.Effect<A, UnauthorizedError, SessionContext | R>

export const policy = <A, R = never>(
  predicate: (
    session: Session,
  ) => Effect.Effect<Result.Result<A, string>, unknown, R> | Result.Result<A, string>,
): Policy<A, R> =>
  Effect.gen(function* () {
    const session = yield* SessionContext
    const effectOrResult = predicate(session)
    const result = Result.isResult(effectOrResult) ? effectOrResult : yield* effectOrResult

    if (Result.isFailure(result))
      return yield* new UnauthorizedError({ message: result.failure, session })

    return result.success
  }).pipe(
    // Policies should always error with Unauthorized
    Effect.mapError((e) =>
      typeof e === "object" && !!e && "_tag" in e && e._tag === "UnauthorizedError"
        ? (e as UnauthorizedError)
        : new UnauthorizedError({ session: { type: "VISITOR" } }),
    ),
  )

/** Helper to make policies' positive results explicit */
export const allow = <A = void>(value: A) => Result.succeed(value)

/** Helper to make policies' negative results explicit */
export const deny = (message: string = "Denied") => Result.fail(message)

/** Always-deny policy for usage in ternaries
 * @example
 * profile.type === 'ORGANIZATION'
   ? organizationPermission("organization:edit-profile", profile.id)
   : denyPolicy
 */
export const denyPolicy = policy(() => deny())

/**
 * Utility types for combining policies
 */
type UnionOfA<Policies> = Policies extends readonly [infer P, ...infer Rest]
  ? P extends Policy<infer A, any>
    ? A | UnionOfA<Rest>
    : never
  : never

type UnionOfR<Policies> = Policies extends readonly [infer P, ...infer Rest]
  ? P extends Policy<any, infer R>
    ? R | UnionOfR<Rest>
    : never
  : never

type TupleOfA<Policies> = {
  [K in keyof Policies]: Policies[K] extends Policy<infer A, any> ? A : never
}

/**
 * Combines policies with OR logic: succeeds if any policy succeeds, returning the union of their A types.
 */
export const or = <Policies extends ReadonlyArray<Policy<any, any>>>(
  ...policies: Policies
): Policy<UnionOfA<Policies>, UnionOfR<Policies>> => {
  return policies.reduce((acc, p) => acc.pipe(Effect.catch(() => p))) as Policy<
    UnionOfA<Policies>,
    UnionOfR<Policies>
  >
}

/**
 * Helper for generator patterns that need to return union types from different branches
 */
export const unionPolicy = <A, R = never>(
  generator: () => Effect.Effect<A, UnauthorizedError, SessionContext | R>,
): Policy<A, R> => generator()

/**
 * Combines policies with AND logic: succeeds if all policies succeed, returning a tuple of their A types.
 */
export const and = <Policies extends ReadonlyArray<Policy<any, any>>>(
  ...policies: Policies
): Policy<TupleOfA<Policies>, UnionOfR<Policies>> => {
  return Effect.all(policies) as Policy<TupleOfA<Policies>, UnionOfR<Policies>>
}

export const toResult = <A, R>(policy: Policy<A, R>) =>
  policy.pipe(
    Effect.map((value) => Result.succeed(value)),
    Effect.catchTag("UnauthorizedError", (error) => Effect.succeed(Result.fail(error))),
  )

/**
 * Converts a policy to a boolean check: returns true if authorized, false otherwise.
 * Useful when you don't need the policy's return value, just the authorization result.
 */
export const check = <A, R>(policy: Policy<A, R>) =>
  policy.pipe(
    Effect.map(() => true),
    Effect.catch(() => Effect.succeed(false)),
  )

export const assertAuthenticated = policy((session) =>
  isAccountSession(session) === true ? allow(session) : deny("Must be logged-in"),
)

export const authenticatedPolicy = <A, R = never>(
  predicate: (
    session: AccountSession,
  ) => Effect.Effect<Result.Result<A, string>, unknown, R> | Result.Result<A, string>,
): Policy<A, R> =>
  assertAuthenticated.pipe(Effect.flatMap((session) => policy(() => predicate(session))))

export const assertTrustedPerson = authenticatedPolicy((session) =>
  Schema.is(TrustedAccessLevel)(session.accessLevel) ? allow(session) : deny(),
)

export const assertNonBlockedPerson = authenticatedPolicy((session) =>
  session.accessLevel !== "BLOCKED" ? allow(session) : deny(),
)

/**
 * Creates a policy that checks if the current user has a specific platform-level permission.
 */
export const platformPermission = (permission: PlatformPermission) =>
  policy((session) => {
    const permissions = getSessionPlatformPermissions(session)
    return permissions.has(permission) === true
      ? allow(session)
      : deny(`Missing permission ${permission}`)
  })

/**
 * Creates a policy that checks if the current user has a specific organization-level permission.
 */
export const organizationPermission = (
  permission: OrganizationPermission,
  organization_id: OrganizationId,
) =>
  assertTrustedPerson.pipe(
    Effect.flatMap((session) =>
      policy(() => {
        const orgPermissions = getSessionOrganizationPermissions(session)
        return orgPermissions[organization_id]?.has(permission)
          ? allow(session)
          : deny(`Missing permission ${permission} for organization ${organization_id}`)
      }),
    ),
  )
