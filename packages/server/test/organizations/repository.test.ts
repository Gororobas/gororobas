/**
 * Tests repository layer methods for organizations, including:
 * - Organization CRUD (findById, insertRow, updateRow, deleteRow)
 * - Membership CRUD (findMembership, listMembers, insertMembership, updateMembership, deleteMembership)
 * - Sole manager query (findOrganizationsWhereSoleManager)
 * - Transaction rollback/commit tests
 */
import { describe, expect, it } from "@effect/vitest"
import { IdGen, OrganizationId, PersonId } from "@gororobas/domain"
import { assertPropertyEffect, deepEquals } from "@gororobas/domain/testing"
import { DateTime, Effect, Option } from "effect"

import { OrganizationsRepository } from "../../src/organizations/repository.js"
import {
  makeMembershipFixture,
  makeOrganizationFixture,
  makeOrganizationProfileFixture,
  makePersonFixture,
  makeProfileFixture,
  membershipWithDependenciesArbitrary,
  organizationWithProfileArbitrary,
} from "../fixtures.js"
import {
  assertTransactionProperty,
  DATABASE_PROPERTY_TEST_CONFIG,
  insertMembershipWithDependencies,
  insertOrganizationWithDependencies,
  insertPersonWithDependencies,
  TestLayer,
} from "../test-helpers.js"

describe("OrganizationsRepository", () => {
  describe("findById", () => {
    it.effect("returns None when organization does not exist", () =>
      Effect.gen(function* () {
        const repo = yield* OrganizationsRepository
        const nonExistentId = yield* IdGen.make(OrganizationId)
        const result = yield* repo.findById(nonExistentId)
        expect(Option.isNone(result)).toBe(true)
      }).pipe(Effect.provide(TestLayer)),
    )

    it.effect("preserves data through SQL round-trip", () =>
      assertPropertyEffect(
        organizationWithProfileArbitrary,
        ({ organization, profile }) =>
          Effect.gen(function* () {
            const repo = yield* OrganizationsRepository

            yield* insertOrganizationWithDependencies({ organization, profile })

            const result = yield* repo.findById(organization.id)
            if (Option.isNone(result)) return false

            return deepEquals(Option.getOrThrow(result), organization)
          }).pipe(Effect.provide(TestLayer)),
        DATABASE_PROPERTY_TEST_CONFIG,
      ),
    )
  })

  describe("updateRow", () => {
    it.effect("applying same update twice produces same result", () =>
      assertPropertyEffect(
        organizationWithProfileArbitrary,
        ({ organization, profile }) =>
          Effect.gen(function* () {
            const repo = yield* OrganizationsRepository

            yield* insertOrganizationWithDependencies({ organization, profile })

            const updateData = {
              id: organization.id,
              type: organization.type,
              membersVisibility: "COMMUNITY" as const,
            }

            yield* repo.updateRow(updateData)
            const afterFirstUpdate = yield* repo.findById(organization.id)

            yield* repo.updateRow(updateData)
            const afterSecondUpdate = yield* repo.findById(organization.id)

            return Option.match(afterFirstUpdate, {
              onNone: () => false,
              onSome: (firstValue) =>
                Option.match(afterSecondUpdate, {
                  onNone: () => false,
                  onSome: (secondValue) =>
                    firstValue.membersVisibility === "COMMUNITY" &&
                    deepEquals(firstValue, secondValue),
                }),
            })
          }).pipe(Effect.provide(TestLayer)),
        DATABASE_PROPERTY_TEST_CONFIG,
      ),
    )
  })

  describe("deleteRow", () => {
    it.effect("removes organization from database", () =>
      assertPropertyEffect(
        organizationWithProfileArbitrary,
        ({ organization, profile }) =>
          Effect.gen(function* () {
            const repo = yield* OrganizationsRepository

            yield* insertOrganizationWithDependencies({ organization, profile })
            yield* repo.deleteRow(organization.id)

            const result = yield* repo.findById(organization.id)
            return Option.isNone(result)
          }).pipe(Effect.provide(TestLayer)),
        DATABASE_PROPERTY_TEST_CONFIG,
      ),
    )
  })

  describe("memberships", () => {
    it.effect("insertMembership and findMembership round-trip", () =>
      assertPropertyEffect(
        membershipWithDependenciesArbitrary,
        ({ person, personProfile, organization, organizationProfile, membership }) =>
          Effect.gen(function* () {
            const repo = yield* OrganizationsRepository

            yield* insertMembershipWithDependencies({
              membership,
              person,
              personProfile,
              organization,
              organizationProfile,
            })

            const result = yield* repo.findMembership({
              organizationId: organization.id,
              personId: person.id,
            })

            if (Option.isNone(result)) return false
            const retrieved = Option.getOrThrow(result)

            return deepEquals(retrieved, membership)
          }).pipe(Effect.provide(TestLayer)),
        DATABASE_PROPERTY_TEST_CONFIG,
      ),
    )

    it.effect("findMembership returns None when membership does not exist", () =>
      Effect.gen(function* () {
        const repo = yield* OrganizationsRepository
        const orgId = yield* IdGen.make(OrganizationId)
        const personId = yield* IdGen.make(PersonId)

        const result = yield* repo.findMembership({
          organizationId: orgId,
          personId,
        })
        expect(Option.isNone(result)).toBe(true)
      }).pipe(Effect.provide(TestLayer)),
    )

    it.effect("listMembers returns all members of an organization", () =>
      Effect.gen(function* () {
        const repo = yield* OrganizationsRepository

        const orgProfile = yield* makeOrganizationProfileFixture()
        const organization = yield* makeOrganizationFixture({ id: orgProfile.id })
        yield* insertOrganizationWithDependencies({ organization, profile: orgProfile })

        const person1 = yield* makePersonFixture()
        const person1Profile = yield* makeProfileFixture({ id: person1.id })
        yield* insertPersonWithDependencies({ person: person1, profile: person1Profile })

        const person2 = yield* makePersonFixture()
        const person2Profile = yield* makeProfileFixture({ id: person2.id })
        yield* insertPersonWithDependencies({ person: person2, profile: person2Profile })

        yield* repo.insertMembership(
          yield* makeMembershipFixture({
            organizationId: organization.id,
            personId: person1.id,
            accessLevel: "MANAGER",
          }),
        )
        yield* repo.insertMembership(
          yield* makeMembershipFixture({
            organizationId: organization.id,
            personId: person2.id,
            accessLevel: "VIEWER",
          }),
        )

        const members = yield* repo.listMembers(organization.id)
        expect(members).toHaveLength(2)

        const accessLevels = members.map((m) => m.accessLevel).sort()
        expect(accessLevels).toEqual(["MANAGER", "VIEWER"])
      }).pipe(Effect.provide(TestLayer)),
    )

    it.effect("listMembers returns empty array when no members", () =>
      assertPropertyEffect(
        organizationWithProfileArbitrary,
        ({ organization, profile }) =>
          Effect.gen(function* () {
            const repo = yield* OrganizationsRepository

            yield* insertOrganizationWithDependencies({ organization, profile })

            const members = yield* repo.listMembers(organization.id)
            return members.length === 0
          }).pipe(Effect.provide(TestLayer)),
        DATABASE_PROPERTY_TEST_CONFIG,
      ),
    )

    it.effect("updateMembership modifies access level", () =>
      assertPropertyEffect(
        membershipWithDependenciesArbitrary,
        ({ person, personProfile, organization, organizationProfile, membership }) =>
          Effect.gen(function* () {
            const repo = yield* OrganizationsRepository

            yield* insertMembershipWithDependencies({
              membership: { ...membership, accessLevel: "VIEWER" },
              person,
              personProfile,
              organization,
              organizationProfile,
            })

            const now = yield* DateTime.now
            yield* repo.updateMembership({
              organizationId: organization.id,
              personId: person.id,
              accessLevel: "EDITOR",
              createdAt: membership.createdAt,
              updatedAt: now,
            })

            const result = yield* repo.findMembership({
              organizationId: organization.id,
              personId: person.id,
            })
            if (Option.isNone(result)) return false
            return Option.getOrThrow(result).accessLevel === "EDITOR"
          }).pipe(Effect.provide(TestLayer)),
        DATABASE_PROPERTY_TEST_CONFIG,
      ),
    )

    it.effect("deleteMembership removes the membership", () =>
      assertPropertyEffect(
        membershipWithDependenciesArbitrary,
        ({ person, personProfile, organization, organizationProfile, membership }) =>
          Effect.gen(function* () {
            const repo = yield* OrganizationsRepository

            yield* insertMembershipWithDependencies({
              membership,
              person,
              personProfile,
              organization,
              organizationProfile,
            })

            yield* repo.deleteMembership({
              organizationId: organization.id,
              personId: person.id,
            })

            const result = yield* repo.findMembership({
              organizationId: organization.id,
              personId: person.id,
            })
            return Option.isNone(result)
          }).pipe(Effect.provide(TestLayer)),
        DATABASE_PROPERTY_TEST_CONFIG,
      ),
    )
  })

  describe("findOrganizationsWhereSoleManager", () => {
    it.effect("returns organizations where person is the only manager", () =>
      assertPropertyEffect(
        membershipWithDependenciesArbitrary,
        ({ person, personProfile, organization, organizationProfile, membership }) =>
          Effect.gen(function* () {
            const repo = yield* OrganizationsRepository

            yield* insertMembershipWithDependencies({
              membership: { ...membership, accessLevel: "MANAGER" },
              person,
              personProfile,
              organization,
              organizationProfile,
            })

            const result = yield* repo.findOrganizationsWhereSoleManager(person.id)
            return (
              result.length === 1 &&
              result[0]!.organizationId === organization.id &&
              result[0]!.memberCount === 1
            )
          }).pipe(Effect.provide(TestLayer)),
        DATABASE_PROPERTY_TEST_CONFIG,
      ),
    )

    it.effect("returns empty when another manager exists", () =>
      Effect.gen(function* () {
        const repo = yield* OrganizationsRepository

        const person1 = yield* makePersonFixture()
        const person1Profile = yield* makeProfileFixture({ id: person1.id })
        yield* insertPersonWithDependencies({ person: person1, profile: person1Profile })

        const person2 = yield* makePersonFixture()
        const person2Profile = yield* makeProfileFixture({ id: person2.id })
        yield* insertPersonWithDependencies({ person: person2, profile: person2Profile })

        const orgProfile = yield* makeOrganizationProfileFixture()
        const organization = yield* makeOrganizationFixture({ id: orgProfile.id })
        yield* insertOrganizationWithDependencies({ organization, profile: orgProfile })

        yield* repo.insertMembership(
          yield* makeMembershipFixture({
            organizationId: organization.id,
            personId: person1.id,
            accessLevel: "MANAGER",
          }),
        )
        yield* repo.insertMembership(
          yield* makeMembershipFixture({
            organizationId: organization.id,
            personId: person2.id,
            accessLevel: "MANAGER",
          }),
        )

        const result = yield* repo.findOrganizationsWhereSoleManager(person1.id)
        expect(result).toHaveLength(0)
      }).pipe(Effect.provide(TestLayer)),
    )

    it.effect("returns empty when person has no memberships", () =>
      Effect.gen(function* () {
        const repo = yield* OrganizationsRepository

        const person = yield* makePersonFixture()
        const personProfile = yield* makeProfileFixture({ id: person.id })
        yield* insertPersonWithDependencies({ person, profile: personProfile })

        const result = yield* repo.findOrganizationsWhereSoleManager(person.id)
        expect(result).toHaveLength(0)
      }).pipe(Effect.provide(TestLayer)),
    )
  })

  describe("transactions", () => {
    it.effect("property: organization update rollbacks on failure and commits on success", () =>
      assertTransactionProperty({
        arbitrary: organizationWithProfileArbitrary,
        options: DATABASE_PROPERTY_TEST_CONFIG,
        scenario: ({ organization, profile }) => {
          const withTestLayer = <Value, Error, Requirements>(
            effect: Effect.Effect<Value, Error, Requirements>,
          ) => effect.pipe(Effect.provide(TestLayer))

          return {
            setup: withTestLayer(
              Effect.gen(function* () {
                yield* insertOrganizationWithDependencies({ organization, profile })
                return organization
              }),
            ),
            readState: (persistedOrganization: typeof organization) =>
              withTestLayer(
                Effect.gen(function* () {
                  const repo = yield* OrganizationsRepository
                  return yield* repo.findById(persistedOrganization.id)
                }),
              ),
            transaction: (persistedOrganization: typeof organization) =>
              withTestLayer(
                Effect.gen(function* () {
                  const repo = yield* OrganizationsRepository
                  yield* repo.updateRow({
                    id: persistedOrganization.id,
                    type: persistedOrganization.type,
                    membersVisibility: "PRIVATE",
                  })
                }),
              ),
          }
        },
        validateRollback: (before, after) => deepEquals(before, after),
        validateCommit: (stateAfter) =>
          Option.match(stateAfter, {
            onNone: () => false,
            onSome: (organization) => organization.membersVisibility === "PRIVATE",
          }),
      }),
    )

    it.effect("property: membership update rollbacks on failure and commits on success", () =>
      assertTransactionProperty({
        arbitrary: membershipWithDependenciesArbitrary,
        options: DATABASE_PROPERTY_TEST_CONFIG,
        scenario: ({ person, personProfile, organization, organizationProfile, membership }) => {
          const withTestLayer = <Value, Error, Requirements>(
            effect: Effect.Effect<Value, Error, Requirements>,
          ) => effect.pipe(Effect.provide(TestLayer))

          const membershipWithViewer = { ...membership, accessLevel: "VIEWER" as const }

          return {
            setup: withTestLayer(
              Effect.gen(function* () {
                yield* insertMembershipWithDependencies({
                  membership: membershipWithViewer,
                  person,
                  personProfile,
                  organization,
                  organizationProfile,
                })
                return { organizationId: organization.id, personId: person.id }
              }),
            ),
            readState: (key: {
              organizationId: typeof organization.id
              personId: typeof person.id
            }) =>
              withTestLayer(
                Effect.gen(function* () {
                  const repo = yield* OrganizationsRepository
                  return yield* repo.findMembership(key)
                }),
              ),
            transaction: (key: {
              organizationId: typeof organization.id
              personId: typeof person.id
            }) =>
              withTestLayer(
                Effect.gen(function* () {
                  const repo = yield* OrganizationsRepository
                  const now = yield* DateTime.now
                  yield* repo.updateMembership({
                    organizationId: key.organizationId,
                    personId: key.personId,
                    accessLevel: "MANAGER",
                    createdAt: membershipWithViewer.createdAt,
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
            onSome: (membership) => membership.accessLevel === "MANAGER",
          }),
      }),
    )

    it.effect("property: delete rollbacks on failure and commits on success", () =>
      assertTransactionProperty({
        arbitrary: organizationWithProfileArbitrary,
        options: DATABASE_PROPERTY_TEST_CONFIG,
        scenario: ({ organization, profile }) => {
          const withTestLayer = <Value, Error, Requirements>(
            effect: Effect.Effect<Value, Error, Requirements>,
          ) => effect.pipe(Effect.provide(TestLayer))

          return {
            setup: withTestLayer(
              Effect.gen(function* () {
                yield* insertOrganizationWithDependencies({ organization, profile })
                return organization
              }),
            ),
            readState: (persistedOrganization: typeof organization) =>
              withTestLayer(
                Effect.gen(function* () {
                  const repo = yield* OrganizationsRepository
                  return yield* repo.findById(persistedOrganization.id)
                }),
              ),
            transaction: (persistedOrganization: typeof organization) =>
              withTestLayer(
                Effect.gen(function* () {
                  const repo = yield* OrganizationsRepository
                  yield* repo.deleteRow(persistedOrganization.id)
                }),
              ),
          }
        },
        validateRollback: (before, after) => deepEquals(before, after),
        validateCommit: (stateAfter) => Option.isNone(stateAfter),
      }),
    )
  })
})
