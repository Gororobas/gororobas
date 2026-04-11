import {
  AccountSession,
  OrganizationId,
  OrganizationMembershipSession,
  VisitorSession,
} from "@gororobas/domain"
import {
  OrganizationAccessLevel,
  PersonId,
  PlatformAccessLevel,
  SessionContext,
  UnauthorizedError,
} from "@gororobas/domain"
import { Effect, Layer, Option, Schema } from "effect"
/**
 * Session resolution service for authentication.
 */
import { HttpServerRequest } from "effect/unstable/http"
import { SqlClient, SqlSchema } from "effect/unstable/sql"

export class AuthenticationFailureError extends Schema.TaggedErrorClass<AuthenticationFailureError>()(
  "AuthenticationFailureError",
  {},
) {}

const PersonQueryResult = Schema.Struct({
  accessLevel: PlatformAccessLevel,
  id: PersonId,
})

const MembershipQueryResult = Schema.Struct({
  accessLevel: OrganizationAccessLevel,
  organizationId: OrganizationId,
})

const getAccount = (request: HttpServerRequest.HttpServerRequest): Effect.Effect<string | null> =>
  Effect.sync(() => {
    const authHeader = request.headers.authorization
    if (!authHeader?.startsWith("Bearer ")) return null
    return authHeader.slice(7) || null
  })

export const resolveSession = Effect.gen(function* () {
  const request = yield* HttpServerRequest.HttpServerRequest
  const accountId = yield* getAccount(request)

  const visitorSession: VisitorSession = {
    type: "VISITOR",
  }

  if (accountId === null) {
    return visitorSession
  }

  const sql = yield* SqlClient.SqlClient

  const fetchPerson = SqlSchema.findOneOption({
    execute: (id) => sql`SELECT id, access_level FROM people WHERE id = ${id}`,
    Request: Schema.String,
    Result: PersonQueryResult,
  })

  const fetchMemberships = SqlSchema.findAll({
    execute: (personId) =>
      sql`SELECT organization_id, access_level FROM organization_memberships WHERE person_id = ${personId}`,
    Request: Schema.String,
    Result: MembershipQueryResult,
  })

  const personOption = yield* fetchPerson(accountId)

  if (Option.isNone(personOption) === true) {
    return yield* new UnauthorizedError({
      message: "Account not found",
      session: visitorSession,
    })
  }

  const person = personOption.value
  const memberships = yield* fetchMemberships(accountId)

  const account: AccountSession = {
    accessLevel: person.accessLevel,
    memberships: memberships.map((m) =>
      OrganizationMembershipSession.make({
        accessLevel: m.accessLevel,
        organizationId: m.organizationId,
      }),
    ),
    personId: person.id,
    type: "ACCOUNT",
  }
  return account
}).pipe(
  Effect.catchTags({
    SchemaError: () => Effect.fail(new AuthenticationFailureError()),
    SqlError: () => Effect.fail(new AuthenticationFailureError()),
  }),
)

export const SessionServiceLive = Layer.effect(SessionContext, resolveSession)
