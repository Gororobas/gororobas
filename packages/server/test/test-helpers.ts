/**
 * Test infrastructure helpers for Effect-based testing.
 */
import {
  Handle,
  IdGen,
  SessionContext,
  type OrganizationMembershipRow,
  type OrganizationRow,
  type PersonRow,
  type ProfileRow,
  type Session,
} from "@gororobas/domain"
import { assertPropertyEffect } from "@gororobas/domain/testing"
import { DateTime, Effect, Exit, Layer, Schema } from "effect"
import { FastCheck } from "effect/testing"
import { SqlClient } from "effect/unstable/sql"
import { v7 } from "uuid"

import { OrganizationsRepository } from "../src/organizations/repository.js"
import { PeopleRepository } from "../src/people/repository.js"
import { PeopleService } from "../src/people/service.js"
import { ProfilesRepository } from "../src/profiles/repository.js"
import { ProfileService } from "../src/profiles/service.js"
import { AppSqlTest } from "../src/sql.js"
import { makeProfileFixture } from "./fixtures.js"
import { getTelemetryLayer } from "./telemetry.js"

export const DATABASE_PROPERTY_TEST_CONFIG = { numRuns: 50 } as const

/**
 * Run an effect with a test session context.
 *
 * This helper provides a session to effects that require SessionContext.
 */
export const withSession = <A, E, R>(
  effect: Effect.Effect<A, E, R | SessionContext>,
  session: Session,
): Effect.Effect<A, E, Exclude<R, SessionContext>> =>
  effect.pipe(Effect.provide(Layer.succeed(SessionContext, session)))

/**
 * IdGen test layer that generates UUIDv7 identifiers.
 *
 * Uses the same UUID generation strategy as production.
 */
export const IdGenTest = Layer.succeed(IdGen, {
  generate: () => v7(),
})

/**
 * Compose test layers for common test scenarios.
 *
 * Includes:
 * - getTelemetryLayer(): Optional OpenTelemetry instrumentation (enabled via ENABLE_TELEMETRY)
 * - AppSqlTest: In-memory SQLite with migrations
 * - IdGenTest: UUID generation
 * - PeopleRepository: People data access layer
 * - ProfilesRepository: Profiles data access layer
 */
export const TestLayer = Layer.mergeAll(
  getTelemetryLayer(),
  IdGenTest,
  Layer.effect(OrganizationsRepository, OrganizationsRepository.make),
  Layer.effect(PeopleRepository, PeopleRepository.make),
  Layer.effect(ProfilesRepository, ProfilesRepository.make),
).pipe(Layer.provideMerge(AppSqlTest))

/**
 * Extended test layer that includes service layers for integration tests.
 *
 * Includes everything from TestLayer plus:
 * - PeopleService: People service layer
 * - ProfileService: Profiles service layer
 */
const PeopleServiceLayer = Layer.effect(PeopleService, PeopleService.make).pipe(
  Layer.provide(TestLayer),
)
const ProfilesServiceLayer = Layer.effect(ProfileService, ProfileService.make).pipe(
  Layer.provide(TestLayer),
)

export const TestLayerWithServices = Layer.mergeAll(
  TestLayer,
  PeopleServiceLayer,
  ProfilesServiceLayer,
)

/**
 * Shared transaction test contract:
 * - Capture state before transaction
 * - Run transaction and capture its exit
 * - Capture state after transaction
 */
export const runTransactionScenario = <SetupValue, StateValue, ErrorType, Requirements>({
  setup,
  readState,
  transaction,
}: {
  setup: Effect.Effect<SetupValue, ErrorType, Requirements>
  readState: (setupValue: SetupValue) => Effect.Effect<StateValue, ErrorType, Requirements>
  transaction: (setupValue: SetupValue) => Effect.Effect<void, ErrorType, Requirements>
}) =>
  Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient
    const setupValue = yield* setup
    const stateBefore = yield* readState(setupValue)
    const transactionExit = yield* transaction(setupValue).pipe(sql.withTransaction, Effect.exit)
    const stateAfter = yield* readState(setupValue)

    return {
      setupValue,
      stateBefore,
      stateAfter,
      transactionExit,
    }
  })

class ScenarioIsolationResult<ResultValue> {
  constructor(readonly value: ResultValue) {}
}

const runScenarioInIsolation = <ResultValue, ErrorType>(
  scenario: Effect.Effect<ResultValue, ErrorType, SqlClient.SqlClient>,
) =>
  Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient
    return yield* scenario.pipe(
      Effect.flatMap((value) => Effect.fail(new ScenarioIsolationResult(value))),
      sql.withTransaction,
      Effect.catchIf(
        (error): error is ScenarioIsolationResult<ResultValue> =>
          error instanceof ScenarioIsolationResult,
        (result) => Effect.succeed(result.value),
      ),
    )
  })

export const assertTransactionProperty = <InputValue, SetupValue, StateValue, ErrorType>({
  arbitrary,
  options,
  scenario,
  validateRollback,
  validateCommit,
}: {
  arbitrary: FastCheck.Arbitrary<InputValue>
  options?: Parameters<typeof FastCheck.check>[1]
  scenario: (inputValue: InputValue) => {
    setup: Effect.Effect<SetupValue, ErrorType, never>
    readState: (setupValue: SetupValue) => Effect.Effect<StateValue, ErrorType, never>
    transaction: (setupValue: SetupValue) => Effect.Effect<void, ErrorType, never>
  }
  validateRollback: (
    stateBefore: StateValue,
    stateAfter: StateValue,
    inputValue: InputValue,
  ) => boolean
  validateCommit: (stateAfter: StateValue, inputValue: InputValue) => boolean
}) =>
  assertPropertyEffect(
    arbitrary,
    (inputValue) =>
      Effect.gen(function* () {
        const sharedScenario = scenario(inputValue)

        const rollbackResult = yield* runScenarioInIsolation(
          runTransactionScenario({
            setup: sharedScenario.setup,
            readState: sharedScenario.readState,
            transaction: (setupValue) =>
              sharedScenario
                .transaction(setupValue)
                .pipe(Effect.flatMap(() => Effect.die("Forced rollback for transaction property"))),
          }),
        )

        const commitResult = yield* runScenarioInIsolation(
          runTransactionScenario({
            setup: sharedScenario.setup,
            readState: sharedScenario.readState,
            transaction: sharedScenario.transaction,
          }),
        )

        return (
          Exit.isFailure(rollbackResult.transactionExit) &&
          validateRollback(rollbackResult.stateBefore, rollbackResult.stateAfter, inputValue) &&
          Exit.isSuccess(commitResult.transactionExit) &&
          validateCommit(commitResult.stateAfter, inputValue)
        )
      }).pipe(Effect.provide(TestLayer)),
    options,
  )

export const insertPersonWithDependencies = ({
  person,
  profile,
}: {
  person: PersonRow
  profile: Extract<ProfileRow, { type: "PERSON" }>
}) =>
  Effect.gen(function* () {
    if (person.id !== profile.id) {
      return yield* Effect.fail(
        new Error(`Person/Profile id mismatch in test setup: ${person.id} !== ${profile.id}`),
      )
    }

    const sql = yield* SqlClient.SqlClient
    const peopleRepository = yield* PeopleRepository
    const profilesRepository = yield* ProfilesRepository

    const nowUtc = yield* DateTime.now
    const now = DateTime.formatIso(nowUtc)
    const emailIdPart = person.id.replaceAll("-", "")
    const handleIdPart = person.id.replaceAll("-", "").slice(0, 25)
    const generatedHandle = Schema.decodeUnknownSync(Handle)(`user-${handleIdPart}`)

    yield* sql`
      INSERT INTO accounts (id, name, email, is_email_verified, image, created_at, updated_at)
      VALUES (${person.id}, ${profile.name}, ${`${emailIdPart}@example.com`}, ${1}, ${null}, ${now}, ${now})
      ON CONFLICT (id) DO NOTHING
    `

    yield* profilesRepository.insertProfile({
      ...profile,
      bio: null,
      createdAt: nowUtc,
      handle: generatedHandle,
      photoId: null,
      type: "PERSON",
      updatedAt: nowUtc,
    })

    if (person.accessSetById !== null && person.accessSetById !== person.id) {
      yield* profilesRepository.insertProfile(
        yield* makeProfileFixture({
          id: person.accessSetById,
        }),
      )
    }

    yield* peopleRepository.insertRow(person)
  })

/**
 * Insert an organization and its profile dependency into the test database.
 *
 * Organizations require a profile row (type: ORGANIZATION) to exist first due to FK constraints.
 */
export const insertOrganizationWithDependencies = ({
  organization,
  profile,
}: {
  organization: OrganizationRow
  profile: Extract<ProfileRow, { type: "ORGANIZATION" }>
}) =>
  Effect.gen(function* () {
    if (organization.id !== profile.id) {
      return yield* Effect.fail(
        new Error(
          `Organization/Profile id mismatch in test setup: ${organization.id} !== ${profile.id}`,
        ),
      )
    }

    const profilesRepository = yield* ProfilesRepository
    const organizationsRepository = yield* OrganizationsRepository

    yield* profilesRepository.insertProfile(profile)
    yield* organizationsRepository.insertRow(organization)
  })

/**
 * Insert a membership and all its dependencies (person + account + profile, organization + profile) into the test database.
 */
export const insertMembershipWithDependencies = ({
  membership,
  person,
  personProfile,
  organization,
  organizationProfile,
}: {
  membership: OrganizationMembershipRow
  person: PersonRow
  personProfile: Extract<ProfileRow, { type: "PERSON" }>
  organization: OrganizationRow
  organizationProfile: Extract<ProfileRow, { type: "ORGANIZATION" }>
}) =>
  Effect.gen(function* () {
    yield* insertPersonWithDependencies({ person, profile: personProfile })
    yield* insertOrganizationWithDependencies({ organization, profile: organizationProfile })

    const organizationsRepository = yield* OrganizationsRepository
    yield* organizationsRepository.insertMembership(membership)
  })
