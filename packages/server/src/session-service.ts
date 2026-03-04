/**
 * Session resolution service for authentication.
 */
import { HttpServerRequest } from "@effect/platform"
import { SqlClient, SqlSchema } from "@effect/sql"
import type {
  AccountSession,
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

export class AuthenticationFailureError extends Schema.TaggedError<AuthenticationFailureError>()(
  "AuthenticationFailureError",
  {},
) { }

const PersonQueryResult = Schema.Struct({
  accessLevel: PlatformAccessLevel,
  id: PersonId,
})

const MembershipQueryResult = Schema.Struct({
  accessLevel: OrganizationAccessLevel,
  organizationId: Schema.UUID.pipe(Schema.brand("OrganizationId")),
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

  const fetchPerson = SqlSchema.findOne({
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

  if (Option.isNone(personOption)) {
    return yield* new UnauthorizedError({
      message: "Account not found",
      session: visitorSession,
    })
  }

  const person = personOption.value
  const memberships = yield* fetchMemberships(accountId)

  const account: AccountSession = {
    accessLevel: person.accessLevel,
    memberships: memberships.map(
      (m): OrganizationMembershipSession => ({
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
    ParseError: () => new AuthenticationFailureError(),
    SqlError: () => new AuthenticationFailureError(),
  }),
)

export const SessionServiceLive = Layer.effect(SessionContext, resolveSession)
