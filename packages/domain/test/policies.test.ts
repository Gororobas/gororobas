/**
 * Policy tests using property-based testing.
 */
import { describe, it } from "@effect/vitest"
import { DateTime, Effect, Layer, Schema } from "effect"
import { FastCheck } from "effect/testing"
import { v7 } from "uuid"

import Policies from "../src/authorization/policies.js"
import {
  AccountSession,
  CorePostMetadata,
  IdGen,
  InformationVisibility,
  OrganizationAccessLevel,
  OrganizationId,
  OrganizationRow,
  OrganizationType,
  PersonId,
  PlatformAccessLevel,
  ProfileId,
  Session,
  VisitorSession,
} from "../src/index.js"
import { assertPropertyEffect, propertyWithPrecondition, runPolicySuccess } from "../src/testing.js"

const IdGenTest = Layer.succeed(IdGen, {
  generate: () => v7(),
})

const TEST_PUBLISHED_AT = Effect.runSync(DateTime.now)

// ─── Constructive Arbitraries (no filtering) ───────────────────────────────

const visitorSessionArbitrary = Schema.toArbitrary(VisitorSession)
const accountSessionArbitrary = Schema.toArbitrary(AccountSession)
const trustedAccountSessionArbitrary = accountSessionArbitrary.filter(
  (s) => s.accessLevel !== "BLOCKED" && s.accessLevel !== "NEWCOMER",
)
const sessionArbitrary = Schema.toArbitrary(Session)

const personIdArbitrary = Schema.toArbitrary(PersonId)
const organizationIdArbitrary = Schema.toArbitrary(OrganizationId)
const visibilityArbitrary = Schema.toArbitrary(InformationVisibility)
const organizationTypeArbitrary = Schema.toArbitrary(OrganizationType)
const platformAccessLevelArbitrary = Schema.toArbitrary(PlatformAccessLevel)

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

// ─── Session Helpers ───────────────────────────────

const sessionWithAccessLevel = (
  baseSession: AccountSession,
  accessLevel: AccountSession["accessLevel"],
): AccountSession => ({ ...baseSession, accessLevel })

const sessionWithOrgMembership = (
  baseSession: AccountSession,
  organizationId: OrganizationId,
  accessLevel: OrganizationAccessLevel,
): AccountSession => ({
  ...baseSession,
  memberships: [...baseSession.memberships, { accessLevel, organizationId }],
})

// ─── Constants ─────────────────────────────────────────────────

const ACCESS_LEVEL_ORDER: ReadonlyArray<AccountSession["accessLevel"]> = [
  "BLOCKED",
  "NEWCOMER",
  "COMMUNITY",
  "MODERATOR",
  "ADMIN",
]

// ─── Preconditions ───────────────────────────────────────────────────────

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

// ─── Monotonicity Framework ────────────────────────────────────────────

const assertMonotonic = (
  policyEffect: Effect.Effect<
    unknown,
    unknown,
    import("../src/authorization/session.js").SessionContext
  >,
  description: string,
) =>
  it.effect(`${description} is monotonic`, () =>
    assertPropertyEffect(accountSessionArbitrary, (baseSession) =>
      Effect.gen(function* () {
        const results = yield* Effect.all(
          ACCESS_LEVEL_ORDER.map((level) =>
            runPolicySuccess(policyEffect, sessionWithAccessLevel(baseSession, level)),
          ),
          { concurrency: "unbounded" },
        )

        let seenTrue = false
        for (const result of results) {
          if (seenTrue === true && result === false) return false
          if (result === true) seenTrue = true
        }
        return true
      }),
    ),
  )

// ─── Tests ─────────────────────────────────────────────────────────────────

describe("Policies", () => {
  describe("security invariants", () => {
    it.effect("blocked users can never perform write operations", () =>
      assertPropertyEffect(accountSessionArbitrary, (session) =>
        Effect.gen(function* () {
          const blockedSession = sessionWithAccessLevel(session, "BLOCKED")

          const writePolicies = [
            Policies.posts.canCreate(
              CorePostMetadata.makeUnsafe({
                handle: "test" as CorePostMetadata["handle"],
                ownerProfileId: session.personId as ProfileId,
                publishedAt: TEST_PUBLISHED_AT,
                visibility: "PUBLIC",
              }),
            ),
            Policies.vegetables.canCreate,
            Policies.comments.canCreate,
            Policies.resources.canCreate,
            Policies.organizations.canCreate,
            Policies.media.canCreate,
          ]

          for (const policy of writePolicies) {
            const canWrite = yield* runPolicySuccess(policy, blockedSession)
            if (canWrite === true) return false
          }
          return true
        }).pipe(Effect.provide(IdGenTest)),
      ),
    )

    it.effect("permission checks are idempotent", () =>
      assertPropertyEffect(accountSessionArbitrary, (session) =>
        Effect.gen(function* () {
          const policies = [
            Policies.vegetables.canCreate,
            Policies.resources.canCreate,
            Policies.comments.canCreate,
            Policies.media.canCreate,
          ]

          for (const policy of policies) {
            const result1 = yield* runPolicySuccess(policy, session)
            const result2 = yield* runPolicySuccess(policy, session)
            if (result1 !== result2) return false
          }
          return true
        }),
      ),
    )
  })

  describe("monotonicity", () => {
    assertMonotonic(Policies.vegetables.canCreate, "vegetables:canCreate")
    assertMonotonic(Policies.vegetables.canRevise, "vegetables:canRevise")
    assertMonotonic(Policies.resources.canCreate, "resources:canCreate")
    assertMonotonic(Policies.resources.canRevise, "resources:canRevise")
    assertMonotonic(Policies.organizations.canCreate, "organizations:canCreate")
    assertMonotonic(Policies.comments.canCreate, "comments:canCreate")
    assertMonotonic(Policies.vegetables.canBookmark, "bookmarks:canCreate")
    assertMonotonic(Policies.media.canCreate, "media:canCreate")
  })

  describe("implications", () => {
    it.effect("canEdit implies canView (for owned posts)", () =>
      assertPropertyEffect(
        FastCheck.tuple(accountSessionArbitrary, visibilityArbitrary),
        ([session, visibility]) =>
          Effect.gen(function* () {
            const post = CorePostMetadata.makeUnsafe({
              handle: "test" as CorePostMetadata["handle"],
              ownerProfileId: session.personId as ProfileId,
              publishedAt: TEST_PUBLISHED_AT,
              visibility,
            })
            const canEdit = yield* runPolicySuccess(Policies.posts.canEdit(post), session)
            const canView = yield* runPolicySuccess(Policies.posts.canView(post), session)
            if (canEdit === true) return canView
            return true
          }),
      ),
    )

    it.effect("canDelete implies canView (for owned posts)", () =>
      assertPropertyEffect(
        FastCheck.tuple(accountSessionArbitrary, visibilityArbitrary),
        ([session, visibility]) =>
          Effect.gen(function* () {
            const post = CorePostMetadata.makeUnsafe({
              handle: "test" as CorePostMetadata["handle"],
              ownerProfileId: session.personId as ProfileId,
              publishedAt: TEST_PUBLISHED_AT,
              visibility,
            })
            const canDelete = yield* runPolicySuccess(Policies.posts.canDelete(post), session)
            const canView = yield* runPolicySuccess(Policies.posts.canView(post), session)
            return !canDelete || canView
          }),
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

  describe("posts", () => {
    it.effect("owner can always edit their own post", () =>
      assertPropertyEffect(accountSessionArbitrary, (session) =>
        Effect.gen(function* () {
          const post = CorePostMetadata.makeUnsafe({
            handle: "test" as CorePostMetadata["handle"],
            ownerProfileId: session.personId as ProfileId,
            publishedAt: TEST_PUBLISHED_AT,
            visibility: "PUBLIC",
          })
          return yield* runPolicySuccess(Policies.posts.canEdit(post), session)
        }),
      ),
    )

    it.effect("owner can always delete their own post", () =>
      assertPropertyEffect(accountSessionArbitrary, (session) =>
        Effect.gen(function* () {
          const post = CorePostMetadata.makeUnsafe({
            handle: "test" as CorePostMetadata["handle"],
            ownerProfileId: session.personId as ProfileId,
            publishedAt: TEST_PUBLISHED_AT,
            visibility: "PUBLIC",
          })
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
            const post = CorePostMetadata.makeUnsafe({
              handle: "test" as CorePostMetadata["handle"],
              ownerProfileId: otherPersonId as ProfileId,
              publishedAt: TEST_PUBLISHED_AT,
              visibility: "PUBLIC",
            })
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
            const post = CorePostMetadata.makeUnsafe({
              handle: "test" as CorePostMetadata["handle"],
              ownerProfileId: otherPersonId as ProfileId,
              publishedAt: TEST_PUBLISHED_AT,
              visibility: "PUBLIC",
            })
            const result = yield* runPolicySuccess(Policies.posts.canDelete(post), session)
            return !result
          }),
      ),
    )

    it.effect("public posts are viewable by anyone", () =>
      assertPropertyEffect(sessionArbitrary, (session) =>
        Effect.gen(function* () {
          const personId = yield* IdGen.make(PersonId)
          const post = CorePostMetadata.makeUnsafe({
            handle: "test" as CorePostMetadata["handle"],
            ownerProfileId: personId as ProfileId,
            publishedAt: TEST_PUBLISHED_AT,
            visibility: "PUBLIC",
          })
          return yield* runPolicySuccess(Policies.posts.canView(post), session)
        }).pipe(Effect.provide(IdGenTest)),
      ),
    )

    it.effect("community posts are viewable by trusted users", () =>
      propertyWithPrecondition(accountSessionArbitrary, isTrustedOrHigher, (session) =>
        Effect.gen(function* () {
          const personId = yield* IdGen.make(PersonId)
          const post = CorePostMetadata.makeUnsafe({
            handle: "test" as CorePostMetadata["handle"],
            ownerProfileId: personId as ProfileId,
            publishedAt: TEST_PUBLISHED_AT,
            visibility: "COMMUNITY",
          })
          return yield* runPolicySuccess(Policies.posts.canView(post), session)
        }).pipe(Effect.provide(IdGenTest)),
      ),
    )

    it.effect("visitors cannot view community posts", () =>
      assertPropertyEffect(
        FastCheck.tuple(visitorSessionArbitrary, personIdArbitrary),
        ([session, ownerId]) =>
          Effect.gen(function* () {
            const post = CorePostMetadata.makeUnsafe({
              handle: "test" as CorePostMetadata["handle"],
              ownerProfileId: ownerId as ProfileId,
              publishedAt: TEST_PUBLISHED_AT,
              visibility: "COMMUNITY",
            })
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
            const post = CorePostMetadata.makeUnsafe({
              handle: "test" as CorePostMetadata["handle"],
              ownerProfileId: otherPersonId as ProfileId,
              publishedAt: TEST_PUBLISHED_AT,
              visibility: "PRIVATE",
            })
            const result = yield* runPolicySuccess(Policies.posts.canView(post), session)
            return !result
          }),
      ),
    )

    it.effect("public post viewing is monotonic", () =>
      assertPropertyEffect(
        FastCheck.tuple(accountSessionArbitrary, personIdArbitrary),
        ([baseSession, ownerId]) =>
          Effect.gen(function* () {
            const post = CorePostMetadata.makeUnsafe({
              handle: "test" as CorePostMetadata["handle"],
              ownerProfileId: ownerId as ProfileId,
              publishedAt: TEST_PUBLISHED_AT,
              visibility: "PUBLIC",
            })
            const results = yield* Effect.all(
              ACCESS_LEVEL_ORDER.map((level) =>
                runPolicySuccess(
                  Policies.posts.canView(post),
                  sessionWithAccessLevel(baseSession, level),
                ),
              ),
              { concurrency: "unbounded" },
            )
            let seenTrue = false
            for (const result of results) {
              if (seenTrue === true && result === false) return false
              if (result === true) seenTrue = true
            }
            return true
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

            if (isAdmin(session) === true) return true
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

            if (isAdmin(session) === true) return true
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
      assertPropertyEffect(visitorSessionArbitrary, (session) =>
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
        FastCheck.tuple(visitorSessionArbitrary, organizationArbitrary),
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

  describe("organization membership", () => {
    const memberWithLevel = (
      level: OrganizationAccessLevel,
      sessionArbitrary: typeof accountSessionArbitrary = accountSessionArbitrary,
    ) =>
      FastCheck.tuple(sessionArbitrary, organizationIdArbitrary).map(([session, orgId]) => ({
        session: sessionWithOrgMembership(session, orgId, level),
        orgId,
      }))

    it.effect("managers can delete their organization", () =>
      assertPropertyEffect(
        memberWithLevel("MANAGER", trustedAccountSessionArbitrary),
        ({ session, orgId }) => runPolicySuccess(Policies.organizations.canDelete(orgId), session),
      ),
    )

    it.effect("editors can create organization posts", () =>
      assertPropertyEffect(
        memberWithLevel("EDITOR", trustedAccountSessionArbitrary),
        ({ session, orgId }) =>
          Effect.gen(function* () {
            const post = CorePostMetadata.makeUnsafe({
              handle: "test" as CorePostMetadata["handle"],
              ownerProfileId: orgId as ProfileId,
              publishedAt: TEST_PUBLISHED_AT,
              visibility: "PUBLIC",
            })
            return yield* runPolicySuccess(Policies.posts.canCreate(post), session)
          }),
      ),
    )

    it.effect("editors can edit organization posts", () =>
      assertPropertyEffect(
        memberWithLevel("EDITOR", trustedAccountSessionArbitrary),
        ({ session, orgId }) =>
          Effect.gen(function* () {
            const post = CorePostMetadata.makeUnsafe({
              handle: "test" as CorePostMetadata["handle"],
              ownerProfileId: orgId as ProfileId,
              publishedAt: TEST_PUBLISHED_AT,
              visibility: "PUBLIC",
            })
            return yield* runPolicySuccess(Policies.posts.canEdit(post), session)
          }),
      ),
    )

    it.effect("viewers cannot delete organization", () =>
      assertPropertyEffect(memberWithLevel("VIEWER"), ({ session, orgId }) =>
        Effect.map(
          runPolicySuccess(Policies.organizations.canDelete(orgId), session),
          (allowed) => !allowed,
        ),
      ),
    )

    it.effect("viewers cannot create organization posts", () =>
      assertPropertyEffect(memberWithLevel("VIEWER"), ({ session, orgId }) =>
        Effect.gen(function* () {
          const post = CorePostMetadata.makeUnsafe({
            handle: "test" as CorePostMetadata["handle"],
            ownerProfileId: orgId as ProfileId,
            publishedAt: TEST_PUBLISHED_AT,
            visibility: "PUBLIC",
          })
          const canCreate = yield* runPolicySuccess(Policies.posts.canCreate(post), session)
          return !canCreate
        }),
      ),
    )

    it.effect("organization membership does not grant platform admin rights", () =>
      assertPropertyEffect(memberWithLevel("MANAGER"), ({ session }) =>
        Effect.gen(function* () {
          if (session.accessLevel === "ADMIN") return true

          const canManageAdmins = yield* runPolicySuccess(
            Policies.people.canModifyAccessLevel({
              from: "MODERATOR",
              to: "ADMIN",
            }),
            session,
          )
          return !canManageAdmins
        }),
      ),
    )
  })

  describe("permission composition", () => {
    it.effect("post owner + org member has both permissions", () =>
      assertPropertyEffect(trustedAccountSessionArbitrary, (session) =>
        Effect.gen(function* () {
          const orgId = yield* IdGen.make(OrganizationId)
          const sessionWithMembership = sessionWithOrgMembership(session, orgId, "EDITOR")

          const ownPost = CorePostMetadata.makeUnsafe({
            handle: "test" as CorePostMetadata["handle"],
            ownerProfileId: session.personId as ProfileId,
            publishedAt: TEST_PUBLISHED_AT,
            visibility: "PRIVATE",
          })
          const canEditOwn = yield* runPolicySuccess(
            Policies.posts.canEdit(ownPost),
            sessionWithMembership,
          )
          if (canEditOwn === false) return false

          const orgPost = CorePostMetadata.makeUnsafe({
            handle: "test" as CorePostMetadata["handle"],
            ownerProfileId: orgId as ProfileId,
            publishedAt: TEST_PUBLISHED_AT,
            visibility: "PUBLIC",
          })
          const canEditOrg = yield* runPolicySuccess(
            Policies.posts.canEdit(orgPost),
            sessionWithMembership,
          )

          return canEditOrg
        }).pipe(Effect.provide(IdGenTest)),
      ),
    )

    it.effect("multiple organization memberships work independently", () =>
      assertPropertyEffect(trustedAccountSessionArbitrary, (session) =>
        Effect.gen(function* () {
          const org1 = yield* IdGen.make(OrganizationId)
          const org2 = yield* IdGen.make(OrganizationId)

          const sessionWithMemberships = AccountSession.makeUnsafe({
            ...session,
            memberships: [
              { accessLevel: "MANAGER", organizationId: org1 },
              { accessLevel: "VIEWER", organizationId: org2 },
            ],
          })

          const canDeleteOrg1 = yield* runPolicySuccess(
            Policies.organizations.canDelete(org1),
            sessionWithMemberships,
          )

          const canDeleteOrg2 = yield* runPolicySuccess(
            Policies.organizations.canDelete(org2),
            sessionWithMemberships,
          )

          return canDeleteOrg1 && !canDeleteOrg2
        }).pipe(Effect.provide(IdGenTest)),
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
      assertPropertyEffect(visitorSessionArbitrary, (session) =>
        Effect.map(runPolicySuccess(Policies.vegetables.canCreate, session), (allowed) => !allowed),
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
  })

  describe("bookmarks", () => {
    it.effect("trusted users can create bookmarks", () =>
      propertyWithPrecondition(accountSessionArbitrary, isTrustedOrHigher, (session) =>
        runPolicySuccess(Policies.vegetables.canBookmark, session),
      ),
    )

    it.effect("visitors cannot create bookmarks", () =>
      assertPropertyEffect(visitorSessionArbitrary, (session) =>
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
      assertPropertyEffect(visitorSessionArbitrary, (session) =>
        Effect.map(runPolicySuccess(Policies.comments.canCreate, session), (allowed) => !allowed),
      ),
    )

    it.effect("only moderators and admins can censor comments", () =>
      assertPropertyEffect(accountSessionArbitrary, (session) =>
        Effect.gen(function* () {
          const canCensor = yield* runPolicySuccess(Policies.comments.canCensor, session)
          if (isAdmin(session) === true) return true
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
      assertPropertyEffect(visitorSessionArbitrary, (session) =>
        Effect.map(runPolicySuccess(Policies.media.canCreate, session), (allowed) => !allowed),
      ),
    )

    it.effect("only admins can censor media", () =>
      assertPropertyEffect(accountSessionArbitrary, (session) =>
        Effect.gen(function* () {
          const canCensor = yield* runPolicySuccess(Policies.media.canCensor, session)
          if (isAdmin(session) === true) return true
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
          if (isModeratorOrAdmin(session) === true) return canEvaluate
          return !canEvaluate
        }),
      ),
    )

    it.effect("visitors cannot evaluate revisions", () =>
      assertPropertyEffect(visitorSessionArbitrary, (session) =>
        Effect.map(
          runPolicySuccess(Policies.revisions.canEvaluate, session),
          (allowed) => !allowed,
        ),
      ),
    )
  })
})
