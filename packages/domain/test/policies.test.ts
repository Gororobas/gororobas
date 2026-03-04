/**
 * Policy tests using property-based testing.
 */
import { describe, it } from "@effect/vitest"
import { Arbitrary, Effect } from "effect"

import Policies from "../src/authorization/policies.js"
import {
  AccountSession,
  type CorePostMetadata,
  type OrganizationRow,
  OrganizationId,
  PersonId,
  ProfileId,
  Session,
} from "../src/index.js"
import {
  assertPropertyEffect,
  propertyWithPrecondition,
  runPolicySuccess,
} from "./policy-test-helpers.js"

const sessionArbitrary = Arbitrary.make(Session)
const accountSessionArbitrary = Arbitrary.make(AccountSession)

const createTestPost = (
  ownerProfileId: PersonId | ProfileId,
  visibility: "PUBLIC" | "COMMUNITY" | "PRIVATE" = "PUBLIC",
): CorePostMetadata => ({
  handle: "test-post" as any,
  ownerProfileId: ownerProfileId as ProfileId,
  publishedAt: null,
  visibility,
})

const createTestOrganization = (
  membersVisibility: "PUBLIC" | "COMMUNITY" | "PRIVATE" = "PUBLIC",
): OrganizationRow => ({
  id: OrganizationId.make(crypto.randomUUID()),
  membersVisibility,
  type: "COMMERCIAL",
})

const isTrustedOrHigher = (session: AccountSession) =>
  session.accessLevel === "COMMUNITY" ||
  session.accessLevel === "MODERATOR" ||
  session.accessLevel === "ADMIN"

const isModeratorOrAdmin = (session: AccountSession) =>
  session.accessLevel === "MODERATOR" || session.accessLevel === "ADMIN"

const isNewcomer = (session: AccountSession) => session.accessLevel === "NEWCOMER"

const hasManagerMembership = (session: AccountSession) =>
  session.memberships.some((m) => m.accessLevel === "MANAGER")

describe("Policies", () => {
  describe("posts", () => {
    it.effect("owner can always edit their own post", () =>
      assertPropertyEffect(accountSessionArbitrary, (session) =>
        Effect.gen(function* () {
          const post = createTestPost(session.personId)
          return yield* runPolicySuccess(Policies.posts.canEdit(post), session)
        }),
      ),
    )

    it.effect("owner can always delete their own post", () =>
      assertPropertyEffect(accountSessionArbitrary, (session) =>
        Effect.gen(function* () {
          const post = createTestPost(session.personId)
          return yield* runPolicySuccess(Policies.posts.canDelete(post), session)
        }),
      ),
    )

    it.effect("public posts are viewable by anyone", () =>
      assertPropertyEffect(sessionArbitrary, (session) =>
        Effect.gen(function* () {
          const post = createTestPost(PersonId.make(crypto.randomUUID()), "PUBLIC")
          return yield* runPolicySuccess(Policies.posts.canView(post), session)
        }),
      ),
    )

    it.effect("community posts are viewable by trusted users", () =>
      propertyWithPrecondition(accountSessionArbitrary, isTrustedOrHigher, (session) =>
        Effect.gen(function* () {
          const post = createTestPost(PersonId.make(crypto.randomUUID()), "COMMUNITY")
          return yield* runPolicySuccess(Policies.posts.canView(post), session)
        }),
      ),
    )
  })

  describe("people", () => {
    it.effect("moderators can manage trusted users", () =>
      propertyWithPrecondition(accountSessionArbitrary, isModeratorOrAdmin, (session) =>
        runPolicySuccess(
          Policies.people.canModifyAccessLevel({
            from: "NEWCOMER",
            to: "COMMUNITY",
          }),
          session,
        ),
      ),
    )

    it.effect("newcomers cannot manage access levels", () =>
      propertyWithPrecondition(accountSessionArbitrary, isNewcomer, (session) =>
        Effect.gen(function* () {
          const result = yield* runPolicySuccess(
            Policies.people.canModifyAccessLevel({
              from: "NEWCOMER",
              to: "COMMUNITY",
            }),
            session,
          )
          return !result
        }),
      ),
    )
  })

  describe("organizations", () => {
    it.effect("trusted users can create organizations", () =>
      propertyWithPrecondition(accountSessionArbitrary, isTrustedOrHigher, (session) =>
        runPolicySuccess(Policies.organizations.canCreate, session),
      ),
    )

    it.effect("managers can delete their organization", () =>
      propertyWithPrecondition(
        accountSessionArbitrary,
        (s) => isTrustedOrHigher(s) && hasManagerMembership(s),
        (session) =>
          Effect.gen(function* () {
            const managerMembership = session.memberships.find((m) => m.accessLevel === "MANAGER")!
            return yield* runPolicySuccess(
              Policies.organizations.canDelete(managerMembership.organizationId as OrganizationId),
              session,
            )
          }),
      ),
    )

    it.effect("public organization members are viewable by anyone", () =>
      assertPropertyEffect(sessionArbitrary, (session) =>
        Effect.gen(function* () {
          const org = createTestOrganization("PUBLIC")
          return yield* runPolicySuccess(Policies.organizations.canViewMembers(org), session)
        }),
      ),
    )

    it.effect("community organization members are viewable by trusted users", () =>
      propertyWithPrecondition(accountSessionArbitrary, isTrustedOrHigher, (session) =>
        Effect.gen(function* () {
          const org = createTestOrganization("COMMUNITY")
          return yield* runPolicySuccess(Policies.organizations.canViewMembers(org), session)
        }),
      ),
    )
  })

  describe("vegetables", () => {
    it.effect("trusted users can create vegetables", () =>
      propertyWithPrecondition(accountSessionArbitrary, isTrustedOrHigher, (session) =>
        runPolicySuccess(Policies.vegetables.canCreate, session),
      ),
    )

    it.effect("trusted users can revise vegetables", () =>
      propertyWithPrecondition(accountSessionArbitrary, isTrustedOrHigher, (session) =>
        runPolicySuccess(Policies.vegetables.canRevise, session),
      ),
    )

    it.effect("newcomers cannot create vegetables", () =>
      propertyWithPrecondition(accountSessionArbitrary, isNewcomer, (session) =>
        Effect.gen(function* () {
          const result = yield* runPolicySuccess(Policies.vegetables.canCreate, session)
          return !result
        }),
      ),
    )
  })

  describe("resources", () => {
    it.effect("anyone can access resources", () =>
      assertPropertyEffect(sessionArbitrary, (session) =>
        runPolicySuccess(Policies.resources.canAccess, session),
      ),
    )

    it.effect("trusted users can create resources", () =>
      propertyWithPrecondition(accountSessionArbitrary, isTrustedOrHigher, (session) =>
        runPolicySuccess(Policies.resources.canCreate, session),
      ),
    )
  })

  describe("bookmarks", () => {
    it.effect("trusted users can create bookmarks", () =>
      propertyWithPrecondition(accountSessionArbitrary, isTrustedOrHigher, (session) =>
        runPolicySuccess(Policies.vegetables.canBookmark, session),
      ),
    )

    it.effect("visitors cannot create bookmarks", () =>
      Effect.gen(function* () {
        const visitorSession: Session = { type: "VISITOR" }
        const result = yield* runPolicySuccess(Policies.vegetables.canBookmark, visitorSession)
        return !result
      }),
    )

    it.effect("newcomers cannot create bookmarks", () =>
      propertyWithPrecondition(accountSessionArbitrary, isNewcomer, (session) =>
        Effect.gen(function* () {
          const result = yield* runPolicySuccess(Policies.vegetables.canBookmark, session)
          return !result
        }),
      ),
    )
  })
})
