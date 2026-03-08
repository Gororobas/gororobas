import {
  Handle,
  IdGen,
  PersonId,
  PersonProfileRow,
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
import { SchemaError } from "effect/Schema"

/**
 * Generate arbitraries from schemas using Schema.toArbitrary().
 *
 * These arbitraries can be used with FastCheck for property-based testing.
 */
export const personRowArbitrary = Schema.toArbitrary(PersonRow)
export const profileRowArbitrary = Schema.toArbitrary(ProfileRow).map((profile) => ({
  ...profile,
  photoId: null, // to prevent having to create the image in the DB in tests, enforce empty photoId
}))
export const handleArbitrary = Schema.toArbitrary(Handle)
export const timestampColumnArbitrary = Schema.toArbitrary(TimestampColumn)

/**
 * Constrained arbitrary for person profiles only (not organizations).
 *
 * Useful for testing person-specific profile features.
 *
 * Generated directly from PersonProfileRow schema to ensure correct id type (PersonId).
 */
export const personProfileRowArbitrary = Schema.toArbitrary(PersonProfileRow).map((profile) => ({
  ...profile,
  photoId: null, // to prevent having to create the image in the DB in tests, enforce empty photoId
}))

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
export const makeProfileFixture = (
  overrides?: Partial<Extract<ProfileRow, { type: "PERSON" }>>,
): Effect.Effect<Extract<ProfileRow, { type: "PERSON" }>, SchemaError, IdGen> =>
  Effect.gen(function* () {
    const id = yield* IdGen.make(PersonId)
    const now = yield* DateTime.now

    const base: Extract<ProfileRow, { type: "PERSON" }> = {
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
