import {
	HttpApiMiddleware,
	HttpApiSchema,
	HttpServerRequest,
} from '@effect/platform'
import { SqlClient, SqlSchema } from '@effect/sql'
import { msg } from '@lingui/core/macro'
import { Context, Effect, Layer, Option, Predicate, Schema } from 'effect'
import { ReadonlySet } from 'effect/Schema'
import {
	OrganizationAccessLevel,
	OrganizationId,
	PersonId,
	PlatformAccessLevel,
} from '@/schema'
import { I18nMessage } from './i18n'
import {
	OrganizationPermission,
	orgPermissionsFor,
	PlatformPermission,
	platformPermissionsFor,
} from './permissions'

export const VisitorContext = Schema.Struct({
	type: Schema.Literal('visitor'),
	platform_permissions: ReadonlySet(PlatformPermission),
})

export const OrganizationMembership = Schema.Struct({
	organization_id: OrganizationId,
	access_level: OrganizationAccessLevel,
})
export const AccountContext = Schema.Struct({
	type: Schema.Literal('account'),
	person_id: PersonId,
	access_level: PlatformAccessLevel,
	platform_permissions: ReadonlySet(PlatformPermission),
	memberships: Schema.Array(OrganizationMembership),
	organization_permissions: Schema.Record({
		key: OrganizationId,
		value: ReadonlySet(OrganizationPermission),
	}),
})
export type AccountContext = typeof AccountContext.Type

export const Session = Schema.Union(VisitorContext, AccountContext)
export type Session = typeof Session.Type

export class SessionContext extends Context.Tag('Session')<
	SessionContext,
	Session
>() {}

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

export class AuthenticationFailure extends Schema.TaggedError<AuthenticationFailure>()(
	'AuthenticationFailure',
	{},
	HttpApiSchema.annotations({ status: 500 }),
) {}

export class AuthMiddleware extends HttpApiMiddleware.Tag<AuthMiddleware>()(
	'AuthMiddleware',
	{
		failure: Schema.Union(Unauthorized, AuthenticationFailure),
		provides: SessionContext,
	},
) {}

/**
 * Mock getAccount function - placeholder for BetterAuth integration.
 * Returns account ID from Authorization header if present, null otherwise.
 */
const getAccount = (
	request: HttpServerRequest.HttpServerRequest,
): Effect.Effect<string | null> =>
	Effect.sync(() => {
		const authHeader = request.headers.authorization
		if (!authHeader?.startsWith('Bearer ')) return null
		return authHeader.slice(7) || null
	})

const PersonRow = Schema.Struct({
	id: PersonId,
	access_level: PlatformAccessLevel,
})

const MembershipRow = Schema.Struct({
	organization_id: OrganizationId,
	access_level: OrganizationAccessLevel,
})

const resolveSession = Effect.gen(function* () {
	const request = yield* HttpServerRequest.HttpServerRequest
	const accountId = yield* getAccount(request)

	if (accountId === null) {
		return VisitorContext.make({
			type: 'visitor',
			platform_permissions: platformPermissionsFor('VISITOR'),
		})
	}

	const sql = yield* SqlClient.SqlClient

	const fetchPerson = SqlSchema.findOne({
		Request: Schema.String,
		Result: PersonRow,
		execute: (id) => sql`SELECT id, access_level FROM people WHERE id = ${id}`,
	})

	const fetchMemberships = SqlSchema.findAll({
		Request: Schema.String,
		Result: MembershipRow,
		execute: (personId) =>
			sql`SELECT organization_id, access_level FROM organization_memberships WHERE person_id = ${personId}`,
	})

	const personOption = yield* fetchPerson(accountId)

	if (Option.isNone(personOption)) {
		return yield* new Unauthorized({
			session: VisitorContext.make({
				type: 'visitor',
				platform_permissions: platformPermissionsFor('VISITOR'),
			}),
			// @TODO how to handle this?
			message: msg`Account not found`,
		})
	}

	const person = personOption.value
	const memberships = yield* fetchMemberships(accountId)

	const organization_permissions = Object.fromEntries(
		memberships.map((m) => [
			m.organization_id,
			orgPermissionsFor(m.access_level),
		]),
	) as Record<OrganizationId, ReadonlySet<OrganizationPermission>>

	const account = AccountContext.make({
		type: 'account',
		person_id: person.id,
		access_level: person.access_level,
		platform_permissions: platformPermissionsFor(person.access_level),
		memberships,
		organization_permissions,
	})
	return account
}).pipe(
	Effect.catchTags({
		ParseError: () => new AuthenticationFailure(),
		SqlError: () => new AuthenticationFailure(),
	}),
)

export const AuthMiddlewareLive = Layer.effect(AuthMiddleware, resolveSession)
