import {
	HttpApiMiddleware,
	HttpApiSchema,
	HttpServerRequest,
} from '@effect/platform'
import { SqlClient, SqlSchema } from '@effect/sql'
import { msg } from '@lingui/core/macro'
import { Context, Effect, Layer, Option, Predicate, Schema } from 'effect'
import {
	OrganizationAccessLevel,
	OrganizationId,
	PersonId,
	PersonRow,
	PlatformAccessLevel,
} from '@/schema'
import { I18nMessage } from './i18n'
import {
	type OrganizationPermission,
	organizationPermissionsFor,
	type PlatformPermission,
	platformPermissionsFor,
} from './permissions'

export class VisitorSession extends Schema.Class<VisitorSession>(
	'VisitorSession',
)({
	type: Schema.Literal('VISITOR'),
}) {
	get platform_permissions(): ReadonlySet<PlatformPermission> {
		return platformPermissionsFor(this.type)
	}
}

export class OrganizationMembership extends Schema.Class<OrganizationMembership>(
	'OrganizationMembership',
)({
	organization_id: OrganizationId,
	access_level: OrganizationAccessLevel,
}) {
	get organization_permissions(): ReadonlySet<OrganizationPermission> {
		return organizationPermissionsFor(this.access_level)
	}
}

export class AccountSession extends Schema.Class<AccountSession>(
	'AccountSession',
)({
	type: Schema.Literal('ACCOUNT'),
	person_id: PersonId,
	access_level: PlatformAccessLevel,
	memberships: Schema.Array(OrganizationMembership),
}) {
	get platform_permissions(): ReadonlySet<PlatformPermission> {
		return platformPermissionsFor(this.access_level)
	}

	get organization_permissions() {
		return Object.fromEntries(
			this.memberships.map((m) => [
				m.organization_id,
				organizationPermissionsFor(m.access_level),
			]),
		) as Record<OrganizationId, ReadonlySet<OrganizationPermission>>
	}
}
export const isAccountSession = Schema.is(AccountSession)

export const Session = Schema.Union(VisitorSession, AccountSession)
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
	'Http/AuthMiddleware',
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

const resolveSession = Effect.gen(function* () {
	const request = yield* HttpServerRequest.HttpServerRequest
	const accountId = yield* getAccount(request)

	const visitorSession = VisitorSession.make({
		type: 'VISITOR',
	})

	if (accountId === null) {
		return visitorSession
	}

	const sql = yield* SqlClient.SqlClient

	const fetchPerson = SqlSchema.findOne({
		Request: Schema.String,
		Result: PersonRow.pick('id', 'access_level'),
		execute: (id) => sql`SELECT id, access_level FROM people WHERE id = ${id}`,
	})

	const fetchMemberships = SqlSchema.findAll({
		Request: Schema.String,
		Result: OrganizationMembership,
		execute: (personId) =>
			sql`SELECT organization_id, access_level FROM organization_memberships WHERE person_id = ${personId}`,
	})

	const personOption = yield* fetchPerson(accountId)

	if (Option.isNone(personOption)) {
		return yield* new Unauthorized({
			session: visitorSession,
			// @TODO how to handle this case where there's an account but not a person in the DB? Deleting the account?
			message: msg`Account not found`,
		})
	}

	const person = personOption.value
	const memberships = yield* fetchMemberships(accountId)

	const account = AccountSession.make({
		type: 'ACCOUNT',
		person_id: person.id,
		access_level: person.access_level,
		memberships,
	})
	return account
}).pipe(
	Effect.catchTags({
		ParseError: () => new AuthenticationFailure(),
		SqlError: () => new AuthenticationFailure(),
	}),
)

export const AuthMiddlewareLive = Layer.effect(AuthMiddleware, resolveSession)
