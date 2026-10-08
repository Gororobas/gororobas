import {
  AccountSession,
  AuthSubjectId,
  OrganizationAccessLevel,
  OrganizationId,
  OrganizationMembershipSession,
  PersonId,
  PlatformAccessLevel,
  SessionContext,
  VisitorSession,
} from "@gororobas/domain"
import { Effect, Layer, Option, Schema } from "effect"
import { SqlClient, SqlSchema } from "effect/sql"

/**
 * Resolve authorization roles from the account already verified by authentication middleware.
 * Request headers are credentials, never account IDs.
 */
import { AppAuth } from "./authentication/app-auth.js"

const PersonQueryResult = Schema.Struct({
  accessLevel: PlatformAccessLevel,
  id: PersonId,
})

const MembershipQueryResult = Schema.Struct({
  accessLevel: OrganizationAccessLevel,
  organizationId: OrganizationId,
})

const fetchPerson = SqlSchema.findOneOption({
  execute: (id) =>
    SqlClient.SqlClient.use((sql) => sql`SELECT id, access_level FROM people WHERE id = ${id}`),
  Request: Schema.String,
  Result: PersonQueryResult,
})

const fetchMemberships = SqlSchema.findAll({
  execute: (personId) =>
    SqlClient.SqlClient.use(
      (sql) =>
        sql`SELECT organization_id, access_level FROM organization_memberships WHERE person_id = ${personId}`,
    ),
  Request: Schema.String,
  Result: MembershipQueryResult,
})

export const VISITOR_SESSION: VisitorSession = {
  type: "VISITOR",
}

export const resolveSessionFromAuthSubjectId = (authSubjectId: AuthSubjectId) =>
  Effect.gen(function* () {
    const personOption = yield* fetchPerson(authSubjectId)

    if (Option.isNone(personOption) === true) {
      return VISITOR_SESSION
    }

    const person = personOption.value
    const memberships = yield* fetchMemberships(authSubjectId)

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

export const resolveSession = Effect.gen(function* () {
  const authentication = yield* (yield* AppAuth).getSession()
  return authentication === null
    ? VISITOR_SESSION
    : yield* resolveSessionFromAuthSubjectId(authentication.subjectId)
})

export const SessionServiceLive = Layer.effect(SessionContext, resolveSession)
