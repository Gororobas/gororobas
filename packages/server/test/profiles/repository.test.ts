/**
 * Tests repository layer methods for profiles, including:
 * - Query methods (findByHandle, findById)
 * - Update operations (updateProfileRow)
 * - Property-based tests for invariants
 */
import { describe, expect, it } from "@effect/vitest"
import { Handle, ProfileRow } from "@gororobas/domain"
import { assertPropertyEffect, deepEquals } from "@gororobas/domain/testing"
import { DateTime, Effect, Option, Schema } from "effect"
import { SqlClient } from "effect/unstable/sql"

import { ProfilesRepository } from "../../src/profiles/repository.js"
import {
  makePersonFixture,
  makeProfileFixture,
  personProfileRowArbitrary,
  profileRowArbitrary,
} from "../fixtures.js"
import { TestLayer } from "../test-helpers.js"

describe("ProfilesRepository", () => {
  describe("findByHandle", () => {
    it.effect("returns profile when exists and preserves schema", () =>
      assertPropertyEffect(profileRowArbitrary, (profile) =>
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
      ),
    )

    it.effect("returns None when profile does not exist", () =>
      Effect.gen(function* () {
        const repo = yield* ProfilesRepository
        const result = yield* repo.findByHandle("nonexistent" as Handle)
        expect(Option.isNone(result)).toBe(true)
      }).pipe(Effect.provide(TestLayer)),
    )
  })

  describe("Property 9: Handle Uniqueness Invariant", () => {
    it.effect("isHandleInUse returns true for existing handle", () =>
      // Feature: people-profiles-testing-strategy, Property 9: Handle Uniqueness Invariant
      assertPropertyEffect(profileRowArbitrary, (profile) =>
        Effect.gen(function* () {
          const repo = yield* ProfilesRepository

          // Insert profile
          yield* repo.insertProfile(profile)

          // Verify handle is in use
          const inUse = yield* repo.isHandleInUse(profile.handle)
          return inUse === true
        }).pipe(Effect.provide(TestLayer)),
      ),
    )

    it.effect("isHandleInUse returns false for non-existent handle", () =>
      assertPropertyEffect(Schema.toArbitrary(Handle), (handle: Handle) =>
        Effect.gen(function* () {
          const repo = yield* ProfilesRepository

          // Verify handle is not in use (no profiles exist)
          const inUse = yield* repo.isHandleInUse(handle)
          return inUse === false
        }).pipe(Effect.provide(TestLayer)),
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
      assertPropertyEffect(personProfileRowArbitrary, (profile) =>
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
          yield* repo.updateProfileRow(updateData)

          const result1 = yield* repo.findById(profile.id)
          expect(Option.isSome(result1)).toBe(true)
          const final = Option.getOrThrow(result1)

          expect(final.name).toBe("Idempotent Name")
          expect(DateTime.Equivalence(final.updatedAt, now)).toBe(true)

          return true
        }).pipe(Effect.provide(TestLayer)),
      ),
    )
  })

  describe("Property 7: Transaction Rollback on Failure", () => {
    it.effect("transaction rolls back all changes on failure", () =>
      Effect.gen(function* () {
        const repo = yield* ProfilesRepository
        const sql = yield* SqlClient.SqlClient

        // Setup: Create initial person and profile
        const person = yield* makePersonFixture()

        const profile = yield* makeProfileFixture({
          id: person.id,
          name: "Original Name",
        })
        yield* repo.insertProfile(profile)

        // Action: Attempt multi-step operation in transaction that fails
        yield* Effect.gen(function* () {
          // Step 1: Update profile name
          const now = yield* DateTime.now
          yield* repo.updateProfileRow({
            id: profile.id,
            name: "Updated Name",
            updatedAt: now,
          })

          // Step 2: Verify update succeeded within transaction
          const intermediate = yield* repo.findById(profile.id)
          expect(Option.isSome(intermediate)).toBe(true)
          expect(Option.getOrThrow(intermediate).name).toBe("Updated Name")

          // Step 3: Intentionally fail to trigger rollback
          // @effect-diagnostics-next-line globalErrorInEffectFailure:off
          // @effect-diagnostics-next-line missingReturnYieldStar:off
          yield* Effect.fail(new Error("Intentional failure"))
        }).pipe(sql.withTransaction, Effect.exit)

        // Verify: Database state rolled back to original
        const finalProfile = yield* repo.findById(profile.id)
        expect(Option.isSome(finalProfile)).toBe(true)
        expect(Option.getOrThrow(finalProfile).name).toBe("Original Name")
      }).pipe(Effect.provide(TestLayer)),
    )

    it.effect("transaction commits all changes on success", () =>
      Effect.gen(function* () {
        const repo = yield* ProfilesRepository
        const sql = yield* SqlClient.SqlClient

        // Setup: Create initial person and profile
        const person = yield* makePersonFixture()

        const profile = yield* makeProfileFixture({
          id: person.id,
          name: "Original Name",
        })
        yield* repo.insertProfile(profile)

        // Action: Multi-step operation in transaction that succeeds
        yield* Effect.gen(function* () {
          // Step 1: Update profile name
          const now = yield* DateTime.now
          yield* repo.updateProfileRow({
            id: profile.id,
            name: "First Update",
            updatedAt: now,
          })

          // Step 2: Update profile name again
          yield* repo.updateProfileRow({
            id: profile.id,
            name: "Second Update",
            updatedAt: now,
          })
        }).pipe(sql.withTransaction)

        // Verify: Both updates committed
        const finalProfile = yield* repo.findById(profile.id)
        expect(Option.isSome(finalProfile)).toBe(true)
        expect(Option.getOrThrow(finalProfile).name).toBe("Second Update")
      }).pipe(Effect.provide(TestLayer)),
    )

    it.effect("multi-step operations maintain consistency", () =>
      assertPropertyEffect(profileRowArbitrary, (profile) =>
        Effect.gen(function* () {
          const repo = yield* ProfilesRepository
          const sql = yield* SqlClient.SqlClient

          yield* repo.insertProfile(profile)

          const originalName = profile.name

          // Action: Multi-step transaction with conditional failure
          const shouldFail = profile.name.length % 2 === 0 // Arbitrary condition
          yield* Effect.gen(function* () {
            const now = yield* DateTime.now

            // Step 1: Update name
            yield* repo.updateProfileRow({
              id: profile.id,
              name: "Transaction Name",
              updatedAt: now,
            })

            // Step 2: Conditionally fail
            if (shouldFail) {
              // @effect-diagnostics-next-line globalErrorInEffectFailure:off
              // @effect-diagnostics-next-line missingReturnYieldStar:off
              yield* Effect.fail(new Error("Conditional failure"))
            }
          }).pipe(sql.withTransaction, Effect.exit)

          // Verify: Check final state matches transaction outcome
          const finalProfile = yield* repo.findById(profile.id)
          expect(Option.isSome(finalProfile)).toBe(true)
          const final = Option.getOrThrow(finalProfile)

          if (shouldFail) {
            // Transaction failed: should have original name
            return final.name === originalName
          } else {
            // Transaction succeeded: should have updated name
            return final.name === "Transaction Name"
          }
        }).pipe(Effect.provide(TestLayer)),
      ),
    )
  })
})
