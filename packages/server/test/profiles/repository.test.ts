/**
 * Tests repository layer methods for profiles, including:
 * - Query methods (findByHandle, findById)
 * - Update operations (updateProfileRow)
 * - Property-based tests for invariants
 */
import { describe, expect, it } from "@effect/vitest"
import { Handle, ProfileRow } from "@gororobas/domain"
import { assertPropertyEffect, deepEquals } from "@gororobas/domain/testing"
import { DateTime, Effect, Exit, Option, Schema } from "effect"

import { ProfilesRepository } from "../../src/profiles/repository.js"
import { makeProfileFixture, personProfileRowArbitrary, profileRowArbitrary } from "../fixtures.js"
import {
  assertTransactionProperty,
  DATABASE_PROPERTY_TEST_CONFIG,
  runTransactionScenario,
  TestLayer,
} from "../test-helpers.js"

describe("ProfilesRepository", () => {
  describe("findByHandle", () => {
    it.effect("returns profile when exists and preserves schema", () =>
      assertPropertyEffect(
        profileRowArbitrary,
        (profile) =>
          Effect.gen(function* () {
            const repo = yield* ProfilesRepository

            yield* repo.insertProfile(profile)

            const result = yield* repo.findByHandle(profile.handle)
            const retrieved = Option.getOrThrow(result)

            // Verify schema round-trip: encode → decode should preserve data
            const encoded = yield* Schema.encodeEffect(ProfileRow)(retrieved)
            const decoded = yield* Schema.decodeEffect(ProfileRow)(encoded)

            return deepEquals(retrieved, decoded)
          }).pipe(Effect.provide(TestLayer)),
        DATABASE_PROPERTY_TEST_CONFIG,
      ),
    )

    it.effect("returns None when profile does not exist", () =>
      Effect.gen(function* () {
        const repo = yield* ProfilesRepository
        const missingProfile = yield* makeProfileFixture()
        const result = yield* repo.findByHandle(missingProfile.handle)
        expect(Option.isNone(result)).toBe(true)
      }).pipe(Effect.provide(TestLayer)),
    )
  })

  describe("Property 9: Handle Uniqueness Invariant", () => {
    it.effect("isHandleInUse returns true for existing handle", () =>
      assertPropertyEffect(
        profileRowArbitrary,
        (profile) =>
          Effect.gen(function* () {
            const repo = yield* ProfilesRepository

            // Insert profile
            yield* repo.insertProfile(profile)

            // Verify handle is in use
            const inUse = yield* repo.isHandleInUse(profile.handle)
            return inUse === true
          }).pipe(Effect.provide(TestLayer)),
        DATABASE_PROPERTY_TEST_CONFIG,
      ),
    )

    it.effect("isHandleInUse returns false for non-existent handle", () =>
      assertPropertyEffect(
        Schema.toArbitrary(Handle),
        (handle: Handle) =>
          Effect.gen(function* () {
            const repo = yield* ProfilesRepository

            // Verify handle is not in use (no profiles exist)
            const inUse = yield* repo.isHandleInUse(handle)
            return inUse === false
          }).pipe(Effect.provide(TestLayer)),
        DATABASE_PROPERTY_TEST_CONFIG,
      ),
    )
  })

  describe("updateProfileRow", () => {
    it.effect("modifies database state", () =>
      Effect.gen(function* () {
        const repo = yield* ProfilesRepository

        const profile = yield* makeProfileFixture()
        yield* repo.insertProfile(profile)

        // Action: Update profile
        const newName = "Updated Name"
        const now = yield* DateTime.now
        yield* repo.updateProfileRow({
          id: profile.id,
          name: newName,
          updatedAt: now,
        })

        // Verify: Check database state
        const updated = yield* repo.findById(profile.id)
        expect(Option.isSome(updated)).toBe(true)
        expect(Option.getOrThrow(updated).name).toBe(newName)
      }).pipe(Effect.provide(TestLayer)),
    )
  })

  describe("Property 5: Repository Update Idempotence", () => {
    it.effect("applying same update twice produces same result", () =>
      assertPropertyEffect(
        personProfileRowArbitrary,
        (profile) =>
          Effect.gen(function* () {
            const repo = yield* ProfilesRepository
            yield* repo.insertProfile(profile)

            const now = yield* DateTime.now
            const updateData = {
              id: profile.id,
              name: "Idempotent Name",
              updatedAt: now,
            }

            yield* repo.updateProfileRow(updateData)
            const afterFirstUpdate = yield* repo.findById(profile.id)

            yield* repo.updateProfileRow(updateData)
            const afterSecondUpdate = yield* repo.findById(profile.id)

            return Option.match(afterFirstUpdate, {
              onNone: () => false,
              onSome: (firstValue) =>
                Option.match(afterSecondUpdate, {
                  onNone: () => false,
                  onSome: (secondValue) =>
                    firstValue.name === "Idempotent Name" &&
                    DateTime.Equivalence(firstValue.updatedAt, now) &&
                    deepEquals(firstValue, secondValue),
                }),
            })
          }).pipe(Effect.provide(TestLayer)),
        DATABASE_PROPERTY_TEST_CONFIG,
      ),
    )
  })

  describe("Property 7: Transaction Rollback on Failure", () => {
    it.effect("transaction rolls back all changes on failure", () =>
      Effect.gen(function* () {
        const repo = yield* ProfilesRepository
        const scenario = yield* runTransactionScenario({
          setup: Effect.gen(function* () {
            const profile = yield* makeProfileFixture({ name: "Original Name" })
            yield* repo.insertProfile(profile)
            return profile
          }),
          readState: (profile) => repo.findById(profile.id),
          transaction: (profile) =>
            Effect.gen(function* () {
              const now = yield* DateTime.now
              yield* repo.updateProfileRow({
                id: profile.id,
                name: "Updated Name",
                updatedAt: now,
              })

              const intermediate = yield* repo.findById(profile.id)
              expect(Option.isSome(intermediate)).toBe(true)
              expect(Option.getOrThrow(intermediate).name).toBe("Updated Name")

              // @effect-diagnostics-next-line globalErrorInEffectFailure:off
              // @effect-diagnostics-next-line missingReturnYieldStar:off
              yield* Effect.fail(new Error("Intentional failure"))
            }),
        })

        expect(Exit.isFailure(scenario.transactionExit)).toBe(true)
        expect(Option.isSome(scenario.stateBefore)).toBe(true)
        expect(Option.isSome(scenario.stateAfter)).toBe(true)
        expect(Option.getOrThrow(scenario.stateBefore).name).toBe("Original Name")
        expect(Option.getOrThrow(scenario.stateAfter).name).toBe("Original Name")
      }).pipe(Effect.provide(TestLayer)),
    )

    it.effect("transaction commits all changes on success", () =>
      Effect.gen(function* () {
        const repo = yield* ProfilesRepository
        const scenario = yield* runTransactionScenario({
          setup: Effect.gen(function* () {
            const profile = yield* makeProfileFixture({ name: "Original Name" })
            yield* repo.insertProfile(profile)
            return profile
          }),
          readState: (profile) => repo.findById(profile.id),
          transaction: (profile) =>
            Effect.gen(function* () {
              const now = yield* DateTime.now
              yield* repo.updateProfileRow({
                id: profile.id,
                name: "First Update",
                updatedAt: now,
              })

              yield* repo.updateProfileRow({
                id: profile.id,
                name: "Second Update",
                updatedAt: now,
              })
            }),
        })

        expect(Exit.isSuccess(scenario.transactionExit)).toBe(true)
        expect(Option.isSome(scenario.stateAfter)).toBe(true)
        expect(Option.getOrThrow(scenario.stateAfter).name).toBe("Second Update")
      }).pipe(Effect.provide(TestLayer)),
    )

    it.effect("property: rollbacks on failure and commits on success", () =>
      assertTransactionProperty({
        arbitrary: profileRowArbitrary,
        options: DATABASE_PROPERTY_TEST_CONFIG,
        scenario: (profile) => {
          const withTestLayer = <Value, Error, Requirements>(
            effect: Effect.Effect<Value, Error, Requirements>,
          ) => effect.pipe(Effect.provide(TestLayer))

          return {
            setup: withTestLayer(
              Effect.gen(function* () {
                const repo = yield* ProfilesRepository
                yield* repo.insertProfile(profile)
                return profile
              }),
            ),
            readState: (persistedProfile: typeof profile) =>
              withTestLayer(
                Effect.gen(function* () {
                  const repo = yield* ProfilesRepository
                  return yield* repo.findById(persistedProfile.id)
                }),
              ),
            transaction: (persistedProfile: typeof profile) =>
              withTestLayer(
                Effect.gen(function* () {
                  const repo = yield* ProfilesRepository
                  const now = yield* DateTime.now

                  yield* repo.updateProfileRow({
                    id: persistedProfile.id,
                    name: "Transaction Name",
                    updatedAt: now,
                  })
                }),
              ),
          }
        },
        validateRollback: (before, after) => deepEquals(before, after),
        validateCommit: (stateAfter) =>
          Option.match(stateAfter, {
            onNone: () => false,
            onSome: (profile) => profile.name === "Transaction Name",
          }),
      }),
    )
  })
})
