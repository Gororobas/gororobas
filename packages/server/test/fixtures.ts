import {
  Handle,
  IdGen,
  OrganizationId,
  OrganizationMembershipRow,
  OrganizationProfileRow,
  OrganizationRow,
  PersonId,
  PersonProfileRow,
  PersonRow,
  PlatformAccessLevel,
  ProfileRow,
  ProfileVisibility,
  TimestampColumn,
  type InformationVisibility,
  type OrganizationAccessLevel,
  type OrganizationType,
} from "@gororobas/domain"
/**
 * Fixture factories and arbitraries for property-based testing.
 */
import { DateTime, Effect, Schema } from "effect"
import { SchemaError } from "effect/Schema"
import { FastCheck } from "effect/testing"

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

export const personWithProfileArbitrary = FastCheck.tuple(
  personRowArbitrary,
  personProfileRowArbitrary,
).map(([person, profile]) => ({
  person: {
    ...person,
    id: profile.id,
    accessSetById: person.accessSetById === person.id ? profile.id : person.accessSetById,
  },
  profile,
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

/**
 * Builder pattern helper for creating OrganizationRow fixtures with overrides.
 */
export const makeOrganizationFixture = (
  overrides?: Partial<OrganizationRow> & { id?: OrganizationId },
) =>
  Effect.gen(function* () {
    const id = overrides?.id ?? (yield* IdGen.make(OrganizationId))

    const base: OrganizationRow = {
      id,
      membersVisibility: "PUBLIC" satisfies InformationVisibility,
      type: "TERRITORY" satisfies OrganizationType,
    }

    return { ...base, ...overrides }
  })

/**
 * Builder pattern helper for creating OrganizationProfileRow fixtures with overrides.
 */
export const makeOrganizationProfileFixture = (
  overrides?: Partial<Extract<ProfileRow, { type: "ORGANIZATION" }>>,
): Effect.Effect<Extract<ProfileRow, { type: "ORGANIZATION" }>, SchemaError, IdGen> =>
  Effect.gen(function* () {
    const id = overrides?.id ?? (yield* IdGen.make(OrganizationId))
    const now = yield* DateTime.now

    const base: Extract<ProfileRow, { type: "ORGANIZATION" }> = {
      type: "ORGANIZATION",
      id,
      handle: `org-${id.slice(0, 8)}` as Handle,
      name: "Test Organization",
      bio: null,
      location: null,
      photoId: null,
      visibility: "PUBLIC" satisfies ProfileVisibility,
      createdAt: now,
      updatedAt: now,
    }

    return { ...base, ...overrides }
  })

/**
 * Builder pattern helper for creating OrganizationMembership fixtures with overrides.
 */
export const makeMembershipFixture = (
  overrides: Pick<OrganizationMembershipRow, "organizationId" | "personId"> &
    Partial<OrganizationMembershipRow>,
) =>
  Effect.gen(function* () {
    const now = yield* DateTime.now

    const base: OrganizationMembershipRow = {
      organizationId: overrides.organizationId,
      personId: overrides.personId,
      accessLevel: "VIEWER" satisfies OrganizationAccessLevel,
      createdAt: now,
      updatedAt: now,
    }

    return { ...base, ...overrides }
  })

export const organizationRowArbitrary = Schema.toArbitrary(OrganizationRow)
export const organizationProfileRowArbitrary = Schema.toArbitrary(OrganizationProfileRow).map(
  (profile) => ({
    ...profile,
    photoId: null,
  }),
)

/**
 * Composite arbitrary for an organization with its profile dependency.
 *
 * Ensures matching IDs between organization and profile, analogous to personWithProfileArbitrary.
 */
export const organizationWithProfileArbitrary = FastCheck.tuple(
  organizationRowArbitrary,
  organizationProfileRowArbitrary,
).map(([organization, profile]) => ({
  organization: {
    ...organization,
    id: profile.id,
  },
  profile,
}))

const organizationMembershipRowArbitrary = Schema.toArbitrary(OrganizationMembershipRow)

/**
 * Composite arbitrary for a membership with all its dependencies (person + profile, organization + profile).
 *
 * Ensures matching IDs across all entities and non-null accessLevel/personId for realistic test scenarios.
 */
export const membershipWithDependenciesArbitrary = FastCheck.tuple(
  personWithProfileArbitrary,
  organizationWithProfileArbitrary,
  organizationMembershipRowArbitrary,
).map(
  ([
    { person, profile: personProfile },
    { organization, profile: organizationProfile },
    membership,
  ]) => ({
    person,
    personProfile,
    organization,
    organizationProfile,
    membership: {
      ...membership,
      organizationId: organization.id,
      personId: person.id,
      accessLevel: membership.accessLevel ?? ("VIEWER" as const),
    },
  }),
)
