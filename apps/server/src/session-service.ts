import {
  AccountSession,
  AuthSubjectId,
  OrganizationAccessLevel,
  OrganizationId,
  OrganizationMembershipSession,
  PersonId,
  PlatformAccessLevel,
  type Session,
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
    SqlClient.SqlClient.use(
      (sql) =>
        sql`SELECT p.id, p.access_level FROM people p JOIN auth_subjects a ON a.id = p.id WHERE p.id = ${id} AND a.active = 1`,
    ),
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

/**
 * The requester's session, resolved when a policy first reads it.
 *
 * Each transaction reads it again, on its own connection and under its lock (Turso begins writes
 * with `BEGIN IMMEDIATE`): a demotion that commits before the write denies it, and one that
 * commits after it can't make the write unauthorized. Outside transactions, the first read is
 * kept for the rest of the request.
 */
export const makeSessionContext = (authSubjectId: AuthSubjectId | null) =>
  Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient
    if (authSubjectId === null) return SessionContext.fixed(VISITOR_SESSION)

    // A transaction's service value is a new tuple for every transaction and savepoint.
    let cached: { readonly transaction: object | undefined; readonly session: Session } | undefined

    return SessionContext.of({
      current: Effect.gen(function* () {
        const transaction = Option.getOrUndefined(
          yield* Effect.serviceOption(sql.transactionService),
        )
        if (cached !== undefined && cached.transaction === transaction) return cached.session

        const session = yield* resolveSessionFromAuthSubjectId(authSubjectId).pipe(
          Effect.provideService(SqlClient.SqlClient, sql),
          Effect.orDie,
        )
        cached = { transaction, session }
        return session
      }),
    })
  })

export const SessionServiceLive = Layer.effect(
  SessionContext,
  Effect.gen(function* () {
    const authentication = yield* (yield* AppAuth).getSession()
    return yield* makeSessionContext(authentication?.subjectId ?? null)
  }),
)
