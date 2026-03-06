/**
 * Policy tests using property-based testing.
 */
import { describe, it } from "@effect/vitest"
import { Effect, Layer, Schema } from "effect"
import { FastCheck } from "effect/testing"
import { v7 } from "uuid"

import Policies from "../src/authorization/policies.js"
import {
  AccountSession,
  CorePostMetadata,
  IdGen,
  InformationVisibility,
  OrganizationId,
  OrganizationRow,
  OrganizationType,
  PersonId,
  PlatformAccessLevel,
  ProfileId,
  Session,
} from "../src/index.js"
import {
  assertPropertyEffect,
  propertyWithPrecondition,
  runPolicySuccess,
} from "./policy-test-helpers.js"

const IdGenTest = Layer.succeed(IdGen, {
  generate: () => v7(),
})

// ─── Arbitraries ───────────────────────────────────────────────────────────────

const sessionArbitrary = Schema.toArbitrary(Session)
const accountSessionArbitrary = Schema.toArbitrary(AccountSession)
const personIdArbitrary = Schema.toArbitrary(PersonId)
const visibilityArbitrary = Schema.toArbitrary(InformationVisibility)

const organizationTypeArbitrary = Schema.toArbitrary(OrganizationType)
const platformAccessLevelArbitrary = Schema.toArbitrary(PlatformAccessLevel)
const organizationIdArbitrary = Schema.toArbitrary(OrganizationId)

const organizationArbitrary = FastCheck.tuple(
  organizationIdArbitrary,
  visibilityArbitrary,
  organizationTypeArbitrary,
).map(([id, membersVisibility, type]) =>
  OrganizationRow.makeUnsafe({
    id,
    membersVisibility,
    type,
  }),
)

// ─── Factories ─────────────────────────────────────────────────────────────────

function createTestPost(ownerProfileId: PersonId, visibility: InformationVisibility = "PUBLIC") {
  return CorePostMetadata.makeUnsafe({
    handle: "test-post" as CorePostMetadata["handle"],
    ownerProfileId: ownerProfileId as ProfileId,
    publishedAt: null,
    visibility,
  })
}

// ─── Preconditions ─────────────────────────────────────────────────────────────

const isTrustedOrHigher = (session: AccountSession) =>
  session.accessLevel === "COMMUNITY" ||
  session.accessLevel === "MODERATOR" ||
  session.accessLevel === "ADMIN"

const isModeratorOrAdmin = (session: AccountSession) =>
  session.accessLevel === "MODERATOR" || session.accessLevel === "ADMIN"

const isAdmin = (session: AccountSession) => session.accessLevel === "ADMIN"

const isNewcomer = (session: AccountSession) => session.accessLevel === "NEWCOMER"

const isBlocked = (session: AccountSession) => session.accessLevel === "BLOCKED"

const isNewcomerOrBlocked = (session: AccountSession) => isNewcomer(session) || isBlocked(session)

const hasManagerMembership = (session: AccountSession) =>
  session.memberships.some((m) => m.accessLevel === "MANAGER")

// ─── Tests ─────────────────────────────────────────────────────────────────────

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

    it.effect("non-owners cannot edit posts", () =>
      assertPropertyEffect(
        FastCheck.tuple(accountSessionArbitrary, personIdArbitrary),
        ([session, otherPersonId]) =>
          Effect.gen(function* () {
            if (session.personId === otherPersonId) return true
            const post = createTestPost(otherPersonId)
            const result = yield* runPolicySuccess(Policies.posts.canEdit(post), session)
            return !result
          }),
      ),
    )

    it.effect("non-owners cannot delete posts", () =>
      assertPropertyEffect(
        FastCheck.tuple(accountSessionArbitrary, personIdArbitrary),
        ([session, otherPersonId]) =>
          Effect.gen(function* () {
            if (session.personId === otherPersonId) return true
            const post = createTestPost(otherPersonId)
            const result = yield* runPolicySuccess(Policies.posts.canDelete(post), session)
            return !result
          }),
      ),
    )

    it.effect("public posts are viewable by anyone", () =>
      assertPropertyEffect(sessionArbitrary, (session) =>
        Effect.gen(function* () {
          const personId = yield* IdGen.make(PersonId)
          const post = createTestPost(personId, "PUBLIC")
          return yield* runPolicySuccess(Policies.posts.canView(post), session)
        }).pipe(Effect.provide(IdGenTest)),
      ),
    )

    it.effect("community posts are viewable by trusted users", () =>
      propertyWithPrecondition(accountSessionArbitrary, isTrustedOrHigher, (session) =>
        Effect.gen(function* () {
          const personId = yield* IdGen.make(PersonId)
          const post = createTestPost(personId, "COMMUNITY")
          return yield* runPolicySuccess(Policies.posts.canView(post), session)
        }).pipe(Effect.provide(IdGenTest)),
      ),
    )

    it.effect("visitors cannot view community posts", () =>
      assertPropertyEffect(
        FastCheck.tuple(sessionArbitrary, personIdArbitrary).filter(
          ([session]) => session.type === "VISITOR",
        ),
        ([session, ownerId]) =>
          Effect.gen(function* () {
            const post = createTestPost(ownerId, "COMMUNITY")
            const result = yield* runPolicySuccess(Policies.posts.canView(post), session)
            return !result
          }),
      ),
    )

    it.effect("private posts are not viewable by non-owners", () =>
      assertPropertyEffect(
        FastCheck.tuple(accountSessionArbitrary, personIdArbitrary),
        ([session, otherPersonId]) =>
          Effect.gen(function* () {
            if (session.personId === otherPersonId) return true
            const post = createTestPost(otherPersonId, "PRIVATE")
            const result = yield* runPolicySuccess(Policies.posts.canView(post), session)
            return !result
          }),
      ),
    )

    it.effect("canEdit implies canView (for owned posts)", () =>
      assertPropertyEffect(
        FastCheck.tuple(accountSessionArbitrary, visibilityArbitrary),
        ([session, visibility]) =>
          Effect.gen(function* () {
            const post = createTestPost(session.personId, visibility)
            const canEdit = yield* runPolicySuccess(Policies.posts.canEdit(post), session)
            const canView = yield* runPolicySuccess(Policies.posts.canView(post), session)
            return !canEdit || canView
          }),
      ),
    )

    it.effect("canDelete implies canView (for owned posts)", () =>
      assertPropertyEffect(
        FastCheck.tuple(accountSessionArbitrary, visibilityArbitrary),
        ([session, visibility]) =>
          Effect.gen(function* () {
            const post = createTestPost(session.personId, visibility)
            const canDelete = yield* runPolicySuccess(Policies.posts.canDelete(post), session)
            const canView = yield* runPolicySuccess(Policies.posts.canView(post), session)
            return !canDelete || canView
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
        Effect.map(
          runPolicySuccess(
            Policies.people.canModifyAccessLevel({
              from: "NEWCOMER",
              to: "COMMUNITY",
            }),
            session,
          ),
          (allowed) => !allowed,
        ),
      ),
    )

    it.effect("blocked users cannot manage access levels", () =>
      propertyWithPrecondition(accountSessionArbitrary, isBlocked, (session) =>
        Effect.map(
          runPolicySuccess(
            Policies.people.canModifyAccessLevel({
              from: "NEWCOMER",
              to: "COMMUNITY",
            }),
            session,
          ),
          (allowed) => !allowed,
        ),
      ),
    )

    it.effect("only admins can manage moderator promotions/demotions", () =>
      assertPropertyEffect(
        FastCheck.tuple(accountSessionArbitrary, platformAccessLevelArbitrary),
        ([session, otherLevel]) =>
          Effect.gen(function* () {
            if (otherLevel === "MODERATOR") return true

            const toModerator = yield* runPolicySuccess(
              Policies.people.canModifyAccessLevel({
                from: otherLevel,
                to: "MODERATOR",
              }),
              session,
            )
            const fromModerator = yield* runPolicySuccess(
              Policies.people.canModifyAccessLevel({
                from: "MODERATOR",
                to: otherLevel,
              }),
              session,
            )

            if (isAdmin(session)) return true
            // Non-admins should be denied
            return !toModerator && !fromModerator
          }),
      ),
    )

    it.effect("only admins can manage admin promotions/demotions", () =>
      assertPropertyEffect(
        FastCheck.tuple(accountSessionArbitrary, platformAccessLevelArbitrary),
        ([session, otherLevel]) =>
          Effect.gen(function* () {
            if (otherLevel === "ADMIN") return true

            const toAdmin = yield* runPolicySuccess(
              Policies.people.canModifyAccessLevel({
                from: otherLevel,
                to: "ADMIN",
              }),
              session,
            )
            const fromAdmin = yield* runPolicySuccess(
              Policies.people.canModifyAccessLevel({
                from: "ADMIN",
                to: otherLevel,
              }),
              session,
            )

            if (isAdmin(session)) return true
            return !toAdmin && !fromAdmin
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

    it.effect("newcomers and blocked users cannot create organizations", () =>
      propertyWithPrecondition(accountSessionArbitrary, isNewcomerOrBlocked, (session) =>
        Effect.map(
          runPolicySuccess(Policies.organizations.canCreate, session),
          (allowed) => !allowed,
        ),
      ),
    )

    it.effect("visitors cannot create organizations", () =>
      assertPropertyEffect(
        sessionArbitrary.filter((s) => s.type === "VISITOR"),
        (session) =>
          Effect.map(
            runPolicySuccess(Policies.organizations.canCreate, session),
            (allowed) => !allowed,
          ),
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
          const orgId = yield* IdGen.make(OrganizationId)
          const org = OrganizationRow.makeUnsafe({
            id: orgId,
            membersVisibility: "PUBLIC",
            type: "COMMERCIAL",
          })
          return yield* runPolicySuccess(Policies.organizations.canViewMembers(org), session)
        }).pipe(Effect.provide(IdGenTest)),
      ),
    )

    it.effect("community organization members are viewable by trusted users", () =>
      propertyWithPrecondition(accountSessionArbitrary, isTrustedOrHigher, (session) =>
        Effect.gen(function* () {
          const orgId = yield* IdGen.make(OrganizationId)
          const org = OrganizationRow.makeUnsafe({
            id: orgId,
            membersVisibility: "COMMUNITY",
            type: "COMMERCIAL",
          })
          return yield* runPolicySuccess(Policies.organizations.canViewMembers(org), session)
        }).pipe(Effect.provide(IdGenTest)),
      ),
    )

    it.effect("visitors cannot view private organization members", () =>
      assertPropertyEffect(
        FastCheck.tuple(
          sessionArbitrary.filter((s) => s.type === "VISITOR"),
          organizationArbitrary,
        ).map(
          ([session, org]) => [session, { ...org, membersVisibility: "PRIVATE" as const }] as const,
        ),
        ([session, org]) =>
          Effect.map(
            runPolicySuccess(Policies.organizations.canViewMembers(org), session),
            (allowed) => !allowed,
          ),
      ),
    )

    it.effect("non-member trusted users cannot view private organization members", () =>
      propertyWithPrecondition(
        FastCheck.tuple(accountSessionArbitrary, organizationArbitrary),
        ([session, org]) =>
          isTrustedOrHigher(session) &&
          !session.memberships.some((m) => m.organizationId === org.id),
        ([session, org]) =>
          Effect.map(
            runPolicySuccess(
              Policies.organizations.canViewMembers({
                ...org,
                membersVisibility: "PRIVATE",
              }),
              session,
            ),
            (allowed) => !allowed,
          ),
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
        Effect.map(runPolicySuccess(Policies.vegetables.canCreate, session), (allowed) => !allowed),
      ),
    )

    it.effect("blocked users cannot create vegetables", () =>
      propertyWithPrecondition(accountSessionArbitrary, isBlocked, (session) =>
        Effect.map(runPolicySuccess(Policies.vegetables.canCreate, session), (allowed) => !allowed),
      ),
    )

    it.effect("blocked users cannot revise vegetables", () =>
      propertyWithPrecondition(accountSessionArbitrary, isBlocked, (session) =>
        Effect.map(runPolicySuccess(Policies.vegetables.canRevise, session), (allowed) => !allowed),
      ),
    )

    it.effect("visitors cannot create vegetables", () =>
      assertPropertyEffect(
        sessionArbitrary.filter((s) => s.type === "VISITOR"),
        (session) =>
          Effect.map(
            runPolicySuccess(Policies.vegetables.canCreate, session),
            (allowed) => !allowed,
          ),
      ),
    )

    it.effect("canCreate implies canRevise for vegetables", () =>
      assertPropertyEffect(accountSessionArbitrary, (session) =>
        Effect.gen(function* () {
          const canCreate = yield* runPolicySuccess(Policies.vegetables.canCreate, session)
          const canRevise = yield* runPolicySuccess(Policies.vegetables.canRevise, session)
          return !canCreate || canRevise
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

    it.effect("trusted users can revise resources", () =>
      propertyWithPrecondition(accountSessionArbitrary, isTrustedOrHigher, (session) =>
        runPolicySuccess(Policies.resources.canRevise, session),
      ),
    )

    it.effect("newcomers cannot create resources", () =>
      propertyWithPrecondition(accountSessionArbitrary, isNewcomer, (session) =>
        Effect.map(runPolicySuccess(Policies.resources.canCreate, session), (allowed) => !allowed),
      ),
    )

    it.effect("blocked users cannot create resources", () =>
      propertyWithPrecondition(accountSessionArbitrary, isBlocked, (session) =>
        Effect.map(runPolicySuccess(Policies.resources.canCreate, session), (allowed) => !allowed),
      ),
    )

    it.effect("canCreate implies canRevise for resources", () =>
      assertPropertyEffect(accountSessionArbitrary, (session) =>
        Effect.gen(function* () {
          const canCreate = yield* runPolicySuccess(Policies.resources.canCreate, session)
          const canRevise = yield* runPolicySuccess(Policies.resources.canRevise, session)
          return !canCreate || canRevise
        }),
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
      assertPropertyEffect(
        sessionArbitrary.filter((s) => s.type === "VISITOR"),
        (session) =>
          Effect.map(
            runPolicySuccess(Policies.vegetables.canBookmark, session),
            (allowed) => !allowed,
          ),
      ),
    )

    it.effect("newcomers cannot create bookmarks", () =>
      propertyWithPrecondition(accountSessionArbitrary, isNewcomer, (session) =>
        Effect.map(
          runPolicySuccess(Policies.vegetables.canBookmark, session),
          (allowed) => !allowed,
        ),
      ),
    )

    it.effect("blocked users cannot create bookmarks", () =>
      propertyWithPrecondition(accountSessionArbitrary, isBlocked, (session) =>
        Effect.map(
          runPolicySuccess(Policies.vegetables.canBookmark, session),
          (allowed) => !allowed,
        ),
      ),
    )
  })

  describe("comments", () => {
    it.effect("trusted users can create comments", () =>
      propertyWithPrecondition(accountSessionArbitrary, isTrustedOrHigher, (session) =>
        runPolicySuccess(Policies.comments.canCreate, session),
      ),
    )

    it.effect("newcomers cannot create comments", () =>
      propertyWithPrecondition(accountSessionArbitrary, isNewcomer, (session) =>
        Effect.map(runPolicySuccess(Policies.comments.canCreate, session), (allowed) => !allowed),
      ),
    )

    it.effect("visitors cannot create comments", () =>
      assertPropertyEffect(
        sessionArbitrary.filter((s) => s.type === "VISITOR"),
        (session) =>
          Effect.map(runPolicySuccess(Policies.comments.canCreate, session), (allowed) => !allowed),
      ),
    )

    it.effect("only moderators and admins can censor comments", () =>
      assertPropertyEffect(accountSessionArbitrary, (session) =>
        Effect.gen(function* () {
          const canCensor = yield* runPolicySuccess(Policies.comments.canCensor, session)
          // Only ADMIN has comments:censor permission
          if (isAdmin(session)) return true
          return !canCensor
        }),
      ),
    )
  })

  describe("media", () => {
    it.effect("authenticated users with media:create can create media", () =>
      propertyWithPrecondition(
        accountSessionArbitrary,
        (s) => s.accessLevel !== "BLOCKED",
        (session) => runPolicySuccess(Policies.media.canCreate, session),
      ),
    )

    it.effect("blocked users cannot create media", () =>
      propertyWithPrecondition(accountSessionArbitrary, isBlocked, (session) =>
        Effect.map(runPolicySuccess(Policies.media.canCreate, session), (allowed) => !allowed),
      ),
    )

    it.effect("visitors cannot create media", () =>
      assertPropertyEffect(
        sessionArbitrary.filter((s) => s.type === "VISITOR"),
        (session) =>
          Effect.map(runPolicySuccess(Policies.media.canCreate, session), (allowed) => !allowed),
      ),
    )

    it.effect("only admins can censor media", () =>
      assertPropertyEffect(accountSessionArbitrary, (session) =>
        Effect.gen(function* () {
          const canCensor = yield* runPolicySuccess(Policies.media.canCensor, session)
          if (isAdmin(session)) return true
          return !canCensor
        }),
      ),
    )
  })

  describe("revisions", () => {
    it.effect("only moderators and admins can evaluate revisions", () =>
      assertPropertyEffect(accountSessionArbitrary, (session) =>
        Effect.gen(function* () {
          const canEvaluate = yield* runPolicySuccess(Policies.revisions.canEvaluate, session)
          if (isModeratorOrAdmin(session)) return canEvaluate
          return !canEvaluate
        }),
      ),
    )

    it.effect("visitors cannot evaluate revisions", () =>
      assertPropertyEffect(
        sessionArbitrary.filter((s) => s.type === "VISITOR"),
        (session) =>
          Effect.map(
            runPolicySuccess(Policies.revisions.canEvaluate, session),
            (allowed) => !allowed,
          ),
      ),
    )
  })

  describe("access level monotonicity", () => {
    /**
     * Helper: create an AccountSession at a specific access level, keeping
     * everything else from the source session (memberships, personId).
     */
    const withAccessLevel = (
      session: AccountSession,
      accessLevel: AccountSession["accessLevel"],
    ): AccountSession => ({ ...session, accessLevel })

    const ACCESS_LEVEL_ORDER: ReadonlyArray<AccountSession["accessLevel"]> = [
      "BLOCKED",
      "NEWCOMER",
      "COMMUNITY",
      "MODERATOR",
      "ADMIN",
    ]

    /**
     * For a given policy, assert that if a lower access level is allowed,
     * then all higher access levels are also allowed.
     */
    const assertMonotonicity = (
      policyEffect: Effect.Effect<
        unknown,
        unknown,
        import("../src/authorization/session.js").SessionContext
      >,
    ) =>
      assertPropertyEffect(accountSessionArbitrary, (session) =>
        Effect.gen(function* () {
          const results: boolean[] = []
          for (const level of ACCESS_LEVEL_ORDER) {
            const s = withAccessLevel(session, level)
            results.push(yield* runPolicySuccess(policyEffect, s))
          }
          // Once we see a true, all subsequent must be true
          let seenTrue = false
          for (const result of results) {
            if (seenTrue && !result) return false
            if (result) seenTrue = true
          }
          return true
        }),
      )

    it.effect("vegetables:canCreate is monotonic", () =>
      assertMonotonicity(Policies.vegetables.canCreate),
    )

    it.effect("vegetables:canRevise is monotonic", () =>
      assertMonotonicity(Policies.vegetables.canRevise),
    )

    it.effect("resources:canCreate is monotonic", () =>
      assertMonotonicity(Policies.resources.canCreate),
    )

    it.effect("resources:canRevise is monotonic", () =>
      assertMonotonicity(Policies.resources.canRevise),
    )

    it.effect("organizations:canCreate is monotonic", () =>
      assertMonotonicity(Policies.organizations.canCreate),
    )

    it.effect("comments:canCreate is monotonic", () =>
      assertMonotonicity(Policies.comments.canCreate),
    )

    it.effect("bookmarks:canCreate is monotonic", () =>
      assertMonotonicity(Policies.vegetables.canBookmark),
    )

    it.effect("media:canCreate is monotonic", () => assertMonotonicity(Policies.media.canCreate))

    it.effect("public post viewing is monotonic", () =>
      assertPropertyEffect(
        FastCheck.tuple(accountSessionArbitrary, personIdArbitrary),
        ([session, ownerId]) =>
          Effect.gen(function* () {
            const post = createTestPost(ownerId, "PUBLIC")
            const results: boolean[] = []
            for (const level of ACCESS_LEVEL_ORDER) {
              const s = withAccessLevel(session, level)
              results.push(yield* runPolicySuccess(Policies.posts.canView(post), s))
            }
            let seenTrue = false
            for (const result of results) {
              if (seenTrue && !result) return false
              if (result) seenTrue = true
            }
            return true
          }),
      ),
    )
  })
})
