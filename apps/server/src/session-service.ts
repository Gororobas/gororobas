import {
  AccountSession,
  AuthenticationHttp,
  OrganizationAccessLevel,
  OrganizationId,
  OrganizationMembershipSession,
  PersonId,
  PlatformAccessLevel,
  SessionContext,
  UnauthorizedError,
  VisitorSession,
} from "@gororobas/domain"
import { Effect, Layer, Option, Schema } from "effect"
/**
 * Resolve authorization roles from the account already verified by authentication middleware.
 * Request headers are credentials, never account IDs.
 */
import { SqlClient, SqlSchema } from "effect/sql"

const PersonQueryResult = Schema.Struct({
  accessLevel: PlatformAccessLevel,
  id: PersonId,
})

const MembershipQueryResult = Schema.Struct({
  accessLevel: OrganizationAccessLevel,
  organizationId: OrganizationId,
})

const VISITOR_SESSION: VisitorSession = {
  type: "VISITOR",
}

export const resolveSession = Effect.gen(function* () {
  const authentication = yield* AuthenticationHttp.CurrentSession

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

  const personOption = yield* fetchPerson(authentication.subjectId)

  if (Option.isNone(personOption) === true) {
    return yield* new UnauthorizedError({
      message: "Account not found",
      session: VISITOR_SESSION,
    })
  }

  const person = personOption.value
  const memberships = yield* fetchMemberships(authentication.subjectId)

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
})

export const SessionServiceLive = Layer.effect(SessionContext, resolveSession)
