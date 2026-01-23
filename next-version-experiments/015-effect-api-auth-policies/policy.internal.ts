import { HttpApiMiddleware, HttpApiSchema } from '@effect/platform'
import { msg } from '@lingui/core/macro'
import { Context, Effect, Either, Predicate, Schema } from 'effect'
import { ReadonlySet } from 'effect/Schema'
import {
	AccessLevel,
	OrganizationAccessLevel,
	OrganizationId,
	PersonId,
	TrustedAccessLevel,
} from '@/schema'
import { OrganizationPermission, PlatformPermission } from './permissions'

const VisitorContext = Schema.Struct({
	type: Schema.Literal('visitor'),
	platform_permissions: ReadonlySet(PlatformPermission),
})

const OrganizationMembership = Schema.Struct({
	organization_id: OrganizationId,
	access_level: OrganizationAccessLevel,
})
const AccountContext = Schema.Struct({
	type: Schema.Literal('account'),
	person_id: PersonId,
	access_level: AccessLevel,
	platform_permissions: ReadonlySet(PlatformPermission),
	memberships: Schema.Array(OrganizationMembership),
	organization_permissions: Schema.Record({
		key: OrganizationId,
		value: ReadonlySet(OrganizationPermission),
	}),
})
export type AccountContext = typeof AccountContext.Type

const Session = Schema.Union(VisitorContext, AccountContext)
type Session = typeof Session.Type

export class SessionContext extends Context.Tag('Session')<
	SessionContext,
	Session
>() {}

/** MacroMessageDescriptor from @lingui/core/macro */
const I18nMessage = Schema.Union(
	Schema.Struct({
		id: Schema.String,
		message: Schema.optional(Schema.String),
	}),
	Schema.Struct({
		id: Schema.optional(Schema.String),
		message: Schema.String,
	}),
	Schema.Struct({
		comment: Schema.optional(Schema.String),
		context: Schema.optional(Schema.String),
	}),
)
type I18nMessage = typeof I18nMessage.Type

export class Unauthorized extends Schema.TaggedError<Unauthorized>()(
	'Unauthorized',
	{
		session: Session,
		message: Schema.optional(I18nMessage),
	},
	HttpApiSchema.annotations({ status: 403 }),
) {
	// get message() {
	//   return `Actor (${this.actorId}) is not authorized to perform action "${this.action}" on entity "${this.entity}"`
	// }

	static is(u: unknown): u is Unauthorized {
		return Predicate.isTagged(u, 'Unauthorized')
	}
}

export class AuthMiddleware extends HttpApiMiddleware.Tag<AuthMiddleware>()(
	'AuthMiddleware',
	{
		failure: Unauthorized,
		provides: SessionContext,
	},
) {}

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

export const assertTrustedPerson = assertAuthenticated.pipe(
	Effect.flatMap((session) =>
		Schema.is(TrustedAccessLevel)(session.access_level)
			? allow({ ...session, access_level: session.access_level })
			: deny(msg`Can't access community-only content`),
	),
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
	policy(() =>
		Effect.gen(function* () {
			const session = yield* assertTrustedPerson
			return session.organization_permissions[organization_id]?.has(permission)
				? allow(session)
				: deny(
						msg`Missing permission ${permission} for organization ${organization_id}`,
					)
		}),
	)
