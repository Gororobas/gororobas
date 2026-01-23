import { msg } from '@lingui/core/macro'
import { Effect, Either, Schema } from 'effect'
import { type OrganizationId, TrustedAccessLevel } from '@/schema'
import type { I18nMessage } from './i18n'
import type { OrganizationPermission, PlatformPermission } from './permissions'
import {
	type AccountContext,
	type Session,
	SessionContext,
	Unauthorized,
} from './session'

/**
 * Policies are evaluated against the current session.
 *
 * Policies can assert data about the session or its inputs to provide with type narrowing.
 *
 * @example
 * const assertTrustedPerson: AssertionPolicy<TrustedPerson>
 * const trustedPerson = yield* assertTrustedPerson
 */
type Policy<A, R = never> = Effect.Effect<A, Unauthorized, SessionContext | R>

export const policy = <A, R = never>(
	predicate: (
		session: Session,
	) =>
		| Effect.Effect<Either.Either<A, I18nMessage>, unknown, R>
		| Either.Either<A, I18nMessage>,
): Policy<A, R> =>
	SessionContext.pipe(
		Effect.flatMap((session) =>
			Effect.gen(function* () {
				const session = yield* SessionContext
				const effectOrEither = predicate(session)
				const result = Either.isEither(effectOrEither)
					? effectOrEither
					: yield* effectOrEither

				if (Either.isLeft(result))
					return yield* new Unauthorized({ session, message: result.left })

				return result.right
			}).pipe(
				// Policies should always error with Unauthorized
				Effect.catchAll((e) =>
					typeof e === 'object' &&
					!!e &&
					'_tag' in e &&
					e._tag === 'Unauthorized'
						? (e as Unauthorized)
						: new Unauthorized({ session }),
				),
			),
		),
	)

/** Helper to make policies' positive results explicit */
export const allow = <A = void>(value: A) => Either.right(value)

/** Helper to make policies' negative results explicit */
export const deny = (message?: I18nMessage) => Either.left(message)

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
export const or = <Policies extends readonly Policy<any, any>[]>(
	...policies: Policies
): Policy<UnionOfA<Policies>, UnionOfR<Policies>> => {
	return Effect.firstSuccessOf(policies) as Policy<
		UnionOfA<Policies>,
		UnionOfR<Policies>
	>
}

/**
 * Helper for generator patterns that need to return union types from different branches
 */
export const unionPolicy = <A, R = never>(
	generator: () => Effect.Effect<A, Unauthorized, SessionContext | R>,
): Policy<A, R> => generator()

/**
 * Combines policies with AND logic: succeeds if all policies succeed, returning a tuple of their A types.
 */
export const and = <Policies extends readonly Policy<any, any>[]>(
	...policies: Policies
): Policy<TupleOfA<Policies>, UnionOfR<Policies>> => {
	return Effect.all(policies) as Policy<TupleOfA<Policies>, UnionOfR<Policies>>
}

export const toEither = <A, R>(policy: Policy<A, R>) =>
	policy.pipe(
		Effect.map((result) => Either.right(result)),
		Effect.catchTag('Unauthorized', (error) =>
			Effect.succeed(Either.left(error)),
		),
	)

export const check = <A, R>(policy: Policy<A, R>) =>
	policy.pipe(
		Effect.map(() => true),
		Effect.catchAll(() => Effect.succeed(false)),
	)

export const assertAuthenticated = policy((session) =>
	session.type === 'account' ? allow(session) : deny(msg`Must be logged-in`),
)

export const authenticatedPolicy = <A, R = never>(
	predicate: (
		session: AccountContext,
	) =>
		| Effect.Effect<Either.Either<A, I18nMessage>, unknown, R>
		| Either.Either<A, I18nMessage>,
): Policy<A, R> =>
	assertAuthenticated.pipe(
		Effect.flatMap((session) => policy(() => predicate(session))),
	)

export const assertTrustedPerson = authenticatedPolicy((session) =>
	Schema.is(TrustedAccessLevel)(session.access_level)
		? allow({ ...session, access_level: session.access_level })
		: deny(msg`Can't access community-only content`),
)

/**
 * Creates a policy that checks if the current user has a specific platform-level permission.
 */
export const platformPermission = (permission: PlatformPermission) =>
	policy((session) =>
		session.platform_permissions.has(permission)
			? allow(session)
			: deny(msg`Missing permission ${permission}`),
	)

/**
 * Creates a policy that checks if the current user has a specific organization-level permission.
 */
export const organizationPermission = (
	permission: OrganizationPermission,
	organization_id: OrganizationId,
) =>
	assertTrustedPerson.pipe(
		Effect.flatMap((session) =>
			policy(() =>
				session.organization_permissions[organization_id]?.has(permission)
					? allow(session)
					: deny(
							msg`Missing permission ${permission} for organization ${organization_id}`,
						),
			),
		),
	)
