/**
 * Tests repository layer methods for people, including:
 * - Query methods (findById)
 * - Update operations (updateRow)
 * - Property-based tests for invariants
 */
import { describe, expect, it } from "@effect/vitest"
import { IdGen, PersonId } from "@gororobas/domain"
import { assertPropertyEffect, deepEquals } from "@gororobas/domain/testing"
import { DateTime, Effect, Exit, Option } from "effect"

import { PeopleRepository } from "../../src/people/repository.js"
import { makePersonFixture, makeProfileFixture, personWithProfileArbitrary } from "../fixtures.js"
import {
  assertTransactionProperty,
  DATABASE_PROPERTY_TEST_CONFIG,
  insertPersonWithDependencies,
  runTransactionScenario,
  TestLayer,
} from "../test-helpers.js"

describe("PeopleRepository", () => {
  describe("findById", () => {
    it.effect("returns person when exists", () =>
      Effect.gen(function* () {
        const repo = yield* PeopleRepository

        // Insert test data using repository method
        const person = yield* makePersonFixture()
        const profile = yield* makeProfileFixture({ id: person.id })
        yield* insertPersonWithDependencies({ person, profile })

        // Query
        const result = yield* repo.findById(person.id)

        expect(Option.isSome(result)).toBe(true)
        const retrieved = Option.getOrThrow(result)

        // Verify key fields match
        expect(retrieved.id).toBe(person.id)
        expect(retrieved.accessLevel).toBe(person.accessLevel)
      }).pipe(Effect.provide(TestLayer)),
    )

    it.effect("preserves data through SQL round-trip", () =>
      assertPropertyEffect(
        personWithProfileArbitrary,
        ({ person, profile }) =>
          Effect.gen(function* () {
            const repo = yield* PeopleRepository

            yield* insertPersonWithDependencies({ person, profile })

            const result = yield* repo.findById(person.id)
            if (Option.isNone(result)) return false

            const retrieved = Option.getOrThrow(result)

            return deepEquals(retrieved, person)
          }).pipe(Effect.provide(TestLayer)),
        DATABASE_PROPERTY_TEST_CONFIG,
      ),
    )

    it.effect("returns None when person does not exist", () =>
      Effect.gen(function* () {
        const repo = yield* PeopleRepository
        const nonExistentId = yield* IdGen.make(PersonId)
        const result = yield* repo.findById(nonExistentId)
        expect(Option.isNone(result)).toBe(true)
      }).pipe(Effect.provide(TestLayer)),
    )
  })

  describe("updateRow", () => {
    it.effect("modifies database state", () =>
      Effect.gen(function* () {
        const repo = yield* PeopleRepository

        // Setup: Create person
        const person = yield* makePersonFixture({ accessLevel: "NEWCOMER" })
        const profile = yield* makeProfileFixture({ id: person.id })
        yield* insertPersonWithDependencies({ person, profile })

        // Action: Update access level
        const now = yield* DateTime.now
        yield* repo.updateRow({
          id: person.id,
          accessLevel: "COMMUNITY",
          accessSetAt: now,
          accessSetById: null,
        })

        // Verify: Check database state
        const updated = yield* repo.findById(person.id)
        expect(Option.isSome(updated)).toBe(true)
        const retrieved = Option.getOrThrow(updated)
        expect(retrieved.accessLevel).toBe("COMMUNITY")
        expect(DateTime.Equivalence(retrieved.accessSetAt!, now)).toBe(true)
      }).pipe(Effect.provide(TestLayer)),
    )
  })

  describe("transactions", () => {
    it.effect("transaction rolls back person updates on failure", () =>
      Effect.gen(function* () {
        const repo = yield* PeopleRepository
        const scenario = yield* runTransactionScenario({
          setup: Effect.gen(function* () {
            const person = yield* makePersonFixture({ accessLevel: "NEWCOMER" })
            const profile = yield* makeProfileFixture({ id: person.id })
            yield* insertPersonWithDependencies({ person, profile })
            return person
          }),
          readState: (person) => repo.findById(person.id),
          transaction: (person) =>
            Effect.gen(function* () {
              const now = yield* DateTime.now
              yield* repo.updateRow({
                id: person.id,
                accessLevel: "COMMUNITY",
                accessSetAt: now,
                accessSetById: null,
              })

              const intermediate = yield* repo.findById(person.id)
              expect(Option.isSome(intermediate)).toBe(true)
              expect(Option.getOrThrow(intermediate).accessLevel).toBe("COMMUNITY")

              // @effect-diagnostics-next-line globalErrorInEffectFailure:off
              // @effect-diagnostics-next-line missingReturnYieldStar:off
              yield* Effect.fail(new Error("Intentional failure"))
            }),
        })

        expect(Exit.isFailure(scenario.transactionExit)).toBe(true)
        expect(Option.isSome(scenario.stateBefore)).toBe(true)
        expect(Option.isSome(scenario.stateAfter)).toBe(true)
        expect(Option.getOrThrow(scenario.stateBefore).accessLevel).toBe("NEWCOMER")
        expect(Option.getOrThrow(scenario.stateAfter).accessLevel).toBe("NEWCOMER")
      }).pipe(Effect.provide(TestLayer)),
    )

    it.effect("transaction commits person updates on success", () =>
      Effect.gen(function* () {
        const repo = yield* PeopleRepository
        const scenario = yield* runTransactionScenario({
          setup: Effect.gen(function* () {
            const person = yield* makePersonFixture({ accessLevel: "NEWCOMER" })
            const profile = yield* makeProfileFixture({ id: person.id })
            yield* insertPersonWithDependencies({ person, profile })
            return person
          }),
          readState: (person) => repo.findById(person.id),
          transaction: (person) =>
            Effect.gen(function* () {
              const now = yield* DateTime.now

              yield* repo.updateRow({
                id: person.id,
                accessLevel: "COMMUNITY",
                accessSetAt: now,
                accessSetById: null,
              })

              yield* repo.updateRow({
                id: person.id,
                accessLevel: "MODERATOR",
                accessSetAt: now,
                accessSetById: null,
              })
            }),
        })

        expect(Exit.isSuccess(scenario.transactionExit)).toBe(true)
        expect(Option.isSome(scenario.stateAfter)).toBe(true)
        expect(Option.getOrThrow(scenario.stateAfter).accessLevel).toBe("MODERATOR")
      }).pipe(Effect.provide(TestLayer)),
    )

    it.effect("property: rollbacks on failure and commits on success", () =>
      assertTransactionProperty({
        arbitrary: personWithProfileArbitrary,
        options: DATABASE_PROPERTY_TEST_CONFIG,
        scenario: ({ person, profile }) => {
          const withTestLayer = <Value, Error, Requirements>(
            effect: Effect.Effect<Value, Error, Requirements>,
          ) => effect.pipe(Effect.provide(TestLayer))

          const setup = withTestLayer(
            Effect.gen(function* () {
              yield* insertPersonWithDependencies({ person, profile })
              return person
            }),
          )

          return {
            setup,
            readState: (persistedPerson: typeof person) =>
              withTestLayer(
                Effect.gen(function* () {
                  const repo = yield* PeopleRepository
                  return yield* repo.findById(persistedPerson.id)
                }),
              ),
            transaction: (persistedPerson: typeof person) =>
              withTestLayer(
                Effect.gen(function* () {
                  const repo = yield* PeopleRepository
                  const now = yield* DateTime.now
                  yield* repo.updateRow({
                    id: persistedPerson.id,
                    accessLevel: "ADMIN",
                    accessSetAt: now,
                    accessSetById: null,
                  })
                }),
              ),
          }
        },
        validateRollback: (before, after) => deepEquals(before, after),
        validateCommit: (stateAfter) =>
          Option.match(stateAfter, {
            onNone: () => false,
            onSome: (person) => person.accessLevel === "ADMIN",
          }),
      }),
    )
  })
})
