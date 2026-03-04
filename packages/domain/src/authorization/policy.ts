/**
 * Policy utilities for authorization checks.
 */
import { Effect, Either, Schema } from "effect"

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
  ) => Effect.Effect<Either.Either<A, string>, unknown, R> | Either.Either<A, string>,
): Policy<A, R> =>
  SessionContext.pipe(
    Effect.flatMap((session) =>
      Effect.gen(function* () {
        const session = yield* SessionContext
        const effectOrEither = predicate(session)
        const result = Either.isEither(effectOrEither) ? effectOrEither : yield* effectOrEither

        if (Either.isLeft(result))
          return yield* new UnauthorizedError({ message: result.left, session })

        return result.right
      }).pipe(
        // Policies should always error with Unauthorized
        Effect.catchAll((e) =>
          typeof e === "object" && !!e && "_tag" in e && e._tag === "Unauthorized"
            ? (e as UnauthorizedError)
            : new UnauthorizedError({ session }),
        ),
      ),
    ),
  )

/** Helper to make policies' positive results explicit */
export const allow = <A = void>(value: A) => Either.right(value)

/** Helper to make policies' negative results explicit */
export const deny = (message?: string) => Either.left(message)

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
  return Effect.firstSuccessOf(policies) as Policy<UnionOfA<Policies>, UnionOfR<Policies>>
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

export const toEither = <A, R>(policy: Policy<A, R>) =>
  policy.pipe(
    Effect.map((result) => Either.right(result)),
    Effect.catchTag("Unauthorized", (error) => Effect.succeed(Either.left(error))),
  )

/**
 * Converts a policy to a boolean check: returns true if authorized, false otherwise.
 * Useful when you don't need the policy's return value, just the authorization result.
 */
export const check = <A, R>(policy: Policy<A, R>) =>
  policy.pipe(
    Effect.map(() => true),
    Effect.catchAll(() => Effect.succeed(false)),
  )

export const assertAuthenticated = policy((session) =>
  isAccountSession(session) ? allow(session) : deny("Must be logged-in"),
)

export const authenticatedPolicy = <A, R = never>(
  predicate: (
    session: AccountSession,
  ) => Effect.Effect<Either.Either<A, string>, unknown, R> | Either.Either<A, string>,
): Policy<A, R> =>
  assertAuthenticated.pipe(Effect.flatMap((session) => policy(() => predicate(session))))

export const assertTrustedPerson = authenticatedPolicy((session) =>
  Schema.is(TrustedAccessLevel)(session.accessLevel)
    ? allow(session)
    : deny("Can't access community-only content"),
)

/**
 * Creates a policy that checks if the current user has a specific platform-level permission.
 */
export const platformPermission = (permission: PlatformPermission) =>
  policy((session) => {
    const permissions = getSessionPlatformPermissions(session)
    return permissions.has(permission) ? allow(session) : deny(`Missing permission ${permission}`)
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
