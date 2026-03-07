import {
  Handle,
  IdGen,
  PersonId,
  PersonRow,
  PlatformAccessLevel,
  ProfileRow,
  ProfileVisibility,
  TimestampColumn,
} from "@gororobas/domain"
/**
 * Fixture factories and arbitraries for property-based testing.
 */
import { DateTime, Effect, Schema } from "effect"

/**
 * Generate arbitraries from schemas using Schema.toArbitrary().
 *
 * These arbitraries can be used with FastCheck for property-based testing.
 */
export const personRowArbitrary = Schema.toArbitrary(PersonRow)
export const profileRowArbitrary = Schema.toArbitrary(ProfileRow)
export const handleArbitrary = Schema.toArbitrary(Handle)
export const timestampColumnArbitrary = Schema.toArbitrary(TimestampColumn)

/**
 * Constrained arbitrary for trusted persons (COMMUNITY, MODERATOR, or ADMIN access).
 *
 * Useful for testing features that require elevated permissions.
 */
export const trustedPersonArbitrary = personRowArbitrary.filter(
  (person) =>
    person.accessLevel === "COMMUNITY" ||
    person.accessLevel === "MODERATOR" ||
    person.accessLevel === "ADMIN",
)

/**
 * Constrained arbitrary for admin persons.
 *
 * Useful for testing admin-only features.
 */
export const adminPersonArbitrary = personRowArbitrary.filter(
  (person) => person.accessLevel === "ADMIN",
)

/**
 * Builder pattern helper for creating PersonRow fixtures with overrides.
 *
 * Generates a valid PersonRow with sensible defaults that can be overridden.
 *
 * @example
 * ```typescript
 * const person = yield* makePersonFixture({ accessLevel: "ADMIN" })
 * ```
 */
export const makePersonFixture = (overrides?: Partial<PersonRow>) =>
  Effect.gen(function* () {
    const id = yield* IdGen.make(PersonId)
    const now = yield* DateTime.now

    const base: PersonRow = {
      id,
      accessLevel: "COMMUNITY" satisfies PlatformAccessLevel,
      accessSetAt: now,
      accessSetById: null,
    }

    return { ...base, ...overrides }
  })

/**
 * Builder pattern helper for creating ProfileRow fixtures with overrides.
 *
 * Generates a valid ProfileRow (person type) with sensible defaults that can be overridden.
 *
 * @example
 * ```typescript
 * const profile = yield* makeProfileFixture({
 *   handle: "custom-handle" as Handle,
 *   name: "Custom Name"
 * })
 * ```
 */
export const makeProfileFixture = (overrides?: Partial<ProfileRow>) =>
  Effect.gen(function* () {
    const id = yield* IdGen.make(PersonId)
    const now = yield* DateTime.now

    const base: ProfileRow = {
      type: "PERSON",
      id,
      handle: `user-${id.slice(0, 8)}` as Handle,
      name: "Test User",
      bio: null,
      location: null,
      photoId: null,
      visibility: "PUBLIC" satisfies ProfileVisibility,
      createdAt: now,
      updatedAt: now,
    }

    return { ...base, ...overrides }
  })
