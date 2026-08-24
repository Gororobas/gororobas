/**
 * Policy tests using property-based testing.
 */
import { describe, it } from "@effect/vitest"
import { DateTime, Effect, Layer, Schema } from "effect"
import { FastCheck } from "effect/testing"
import { v7 } from "uuid"

import Policies from "../src/authorization/policies.js"
import { Handle } from "../src/common/primitives.js"
import {
  AccountSession,
  CorePublicationMetadata,
  IdGen,
  InformationVisibility,
  OrganizationAccessLevel,
  OrganizationId,
  OrganizationRow,
  OrganizationType,
  PersonId,
  PlatformAccessLevel,
  Session,
  VisitorSession,
} from "../src/index.js"
import { assertPropertyEffect, propertyWithPrecondition, runPolicySuccess } from "../src/testing.js"

const IdGenTest = Layer.succeed(IdGen, {
  generate: () => v7(),
})

const TEST_PUBLISHED_AT = DateTime.nowUnsafe()
const TEST_HANDLE = Schema.decodeSync(Handle)("test")

// ─── Constructive Arbitraries (no filtering) ───────────────────────────────

const visitorSessionArbitrary = Schema.toArbitrary(VisitorSession)(FastCheck)
const accountSessionArbitrary = Schema.toArbitrary(AccountSession)(FastCheck)
const trustedAccountSessionArbitrary = accountSessionArbitrary.filter(
  (s) => s.accessLevel !== "BLOCKED" && s.accessLevel !== "NEWCOMER",
)
const sessionArbitrary = Schema.toArbitrary(Session)(FastCheck)

const personIdArbitrary = Schema.toArbitrary(PersonId)(FastCheck)
const organizationIdArbitrary = Schema.toArbitrary(OrganizationId)(FastCheck)
const visibilityArbitrary = Schema.toArbitrary(InformationVisibility)(FastCheck)
const organizationTypeArbitrary = Schema.toArbitrary(OrganizationType)(FastCheck)
const platformAccessLevelArbitrary = Schema.toArbitrary(PlatformAccessLevel)(FastCheck)

const organizationArbitrary = FastCheck.tuple(
  organizationIdArbitrary,
  visibilityArbitrary,
  organizationTypeArbitrary,
).map(([id, membersVisibility, type]) =>
  OrganizationRow.make({
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

        return results.every(
          (result, index) =>
            result || results.slice(0, index).every((previousResult) => previousResult === false),
        )
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
            Policies.publications.canCreate(
              CorePublicationMetadata.make({
                handle: TEST_HANDLE,
                ownerProfileId: session.personId,
                publishedAt: TEST_PUBLISHED_AT,
                visibility: "PUBLIC",
              }),
            ),
            Policies.wiki.canCreate,
            Policies.comments.canCreate,
            Policies.resources.canCreate,
            Policies.organizations.canCreate,
            Policies.media.canCreate,
          ]

          const canWriteResults = yield* Effect.forEach(
            writePolicies,
            (policy) => runPolicySuccess(policy, blockedSession),
            { concurrency: 50 },
          )
          return canWriteResults.every((canWrite) => canWrite === false)
        }).pipe(Effect.provide(IdGenTest)),
      ),
    )

    it.effect("permission checks are idempotent", () =>
      assertPropertyEffect(accountSessionArbitrary, (session) =>
        Effect.gen(function* () {
          const policies = [
            Policies.wiki.canCreate,
            Policies.resources.canCreate,
            Policies.comments.canCreate,
            Policies.media.canCreate,
          ]

          const results = yield* Effect.forEach(
            policies,
            (policy) =>
              Effect.all([runPolicySuccess(policy, session), runPolicySuccess(policy, session)], {
                concurrency: 50,
              }),
            { concurrency: 1 },
          )
          return results.every(([result1, result2]) => result1 === result2)
        }),
      ),
    )
  })

  describe("monotonicity", () => {
    assertMonotonic(Policies.wiki.canCreate, "wiki-article:create")
    assertMonotonic(Policies.wiki.canRevise, "wiki-article:revise")
    assertMonotonic(Policies.resources.canCreate, "resources:canCreate")
    assertMonotonic(Policies.resources.canRevise, "resources:canRevise")
    assertMonotonic(Policies.organizations.canCreate, "organizations:canCreate")
    assertMonotonic(Policies.comments.canCreate, "comments:canCreate")
    assertMonotonic(Policies.wiki.canBookmark, "bookmarks:create")
    assertMonotonic(Policies.media.canCreate, "media:canCreate")
  })

  describe("implications", () => {
    it.effect("canEdit implies canView (for owned publications)", () =>
      assertPropertyEffect(
        FastCheck.tuple(accountSessionArbitrary, visibilityArbitrary),
        ([session, visibility]) =>
          Effect.gen(function* () {
            const publication = CorePublicationMetadata.make({
              handle: TEST_HANDLE,
              ownerProfileId: session.personId,
              publishedAt: TEST_PUBLISHED_AT,
              visibility,
            })
            const canEdit = yield* runPolicySuccess(
              Policies.publications.canEdit(publication),
              session,
            )
            const canView = yield* runPolicySuccess(
              Policies.publications.canView(publication),
              session,
            )
            if (canEdit === true) return canView
            return true
          }),
      ),
    )

    it.effect("canDelete implies canView (for owned publications)", () =>
      assertPropertyEffect(
        FastCheck.tuple(accountSessionArbitrary, visibilityArbitrary),
        ([session, visibility]) =>
          Effect.gen(function* () {
            const publication = CorePublicationMetadata.make({
              handle: TEST_HANDLE,
              ownerProfileId: session.personId,
              publishedAt: TEST_PUBLISHED_AT,
              visibility,
            })
            const canDelete = yield* runPolicySuccess(
              Policies.publications.canDelete(publication),
              session,
            )
            const canView = yield* runPolicySuccess(
              Policies.publications.canView(publication),
              session,
            )
            return !canDelete || canView
          }),
      ),
    )

    it.effect("canCreate implies canRevise for wiki articles", () =>
      assertPropertyEffect(accountSessionArbitrary, (session) =>
        Effect.gen(function* () {
          const canCreate = yield* runPolicySuccess(Policies.wiki.canCreate, session)
          const canRevise = yield* runPolicySuccess(Policies.wiki.canRevise, session)
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

  describe("publications", () => {
    it.effect("owner can always edit their own publication", () =>
      assertPropertyEffect(accountSessionArbitrary, (session) =>
        Effect.gen(function* () {
          const publication = CorePublicationMetadata.make({
            handle: TEST_HANDLE,
            ownerProfileId: session.personId,
            publishedAt: TEST_PUBLISHED_AT,
            visibility: "PUBLIC",
          })
          return yield* runPolicySuccess(Policies.publications.canEdit(publication), session)
        }),
      ),
    )

    it.effect("owner can always delete their own publication", () =>
      assertPropertyEffect(accountSessionArbitrary, (session) =>
        Effect.gen(function* () {
          const publication = CorePublicationMetadata.make({
            handle: TEST_HANDLE,
            ownerProfileId: session.personId,
            publishedAt: TEST_PUBLISHED_AT,
            visibility: "PUBLIC",
          })
          return yield* runPolicySuccess(Policies.publications.canDelete(publication), session)
        }),
      ),
    )

    it.effect("non-owners cannot edit publications", () =>
      assertPropertyEffect(
        FastCheck.tuple(accountSessionArbitrary, personIdArbitrary),
        ([session, otherPersonId]) =>
          Effect.gen(function* () {
            if (session.personId === otherPersonId) return true
            const publication = CorePublicationMetadata.make({
              handle: TEST_HANDLE,
              ownerProfileId: otherPersonId,
              publishedAt: TEST_PUBLISHED_AT,
              visibility: "PUBLIC",
            })
            const result = yield* runPolicySuccess(
              Policies.publications.canEdit(publication),
              session,
            )
            return !result
          }),
      ),
    )

    it.effect("non-owners cannot delete publications", () =>
      assertPropertyEffect(
        FastCheck.tuple(accountSessionArbitrary, personIdArbitrary),
        ([session, otherPersonId]) =>
          Effect.gen(function* () {
            if (session.personId === otherPersonId) return true
            const publication = CorePublicationMetadata.make({
              handle: TEST_HANDLE,
              ownerProfileId: otherPersonId,
              publishedAt: TEST_PUBLISHED_AT,
              visibility: "PUBLIC",
            })
            const result = yield* runPolicySuccess(
              Policies.publications.canDelete(publication),
              session,
            )
            return !result
          }),
      ),
    )

    it.effect("public publications are viewable by anyone", () =>
      assertPropertyEffect(sessionArbitrary, (session) =>
        Effect.gen(function* () {
          const personId = yield* IdGen.make(PersonId)
          const publication = CorePublicationMetadata.make({
            handle: TEST_HANDLE,
            ownerProfileId: personId,
            publishedAt: TEST_PUBLISHED_AT,
            visibility: "PUBLIC",
          })
          return yield* runPolicySuccess(Policies.publications.canView(publication), session)
        }).pipe(Effect.provide(IdGenTest)),
      ),
    )

    it.effect("community publications are viewable by trusted users", () =>
      propertyWithPrecondition(accountSessionArbitrary, isTrustedOrHigher, (session) =>
        Effect.gen(function* () {
          const personId = yield* IdGen.make(PersonId)
          const publication = CorePublicationMetadata.make({
            handle: TEST_HANDLE,
            ownerProfileId: personId,
            publishedAt: TEST_PUBLISHED_AT,
            visibility: "COMMUNITY",
          })
          return yield* runPolicySuccess(Policies.publications.canView(publication), session)
        }).pipe(Effect.provide(IdGenTest)),
      ),
    )

    it.effect("visitors cannot view community publications", () =>
      assertPropertyEffect(
        FastCheck.tuple(visitorSessionArbitrary, personIdArbitrary),
        ([session, ownerId]) =>
          Effect.gen(function* () {
            const publication = CorePublicationMetadata.make({
              handle: TEST_HANDLE,
              ownerProfileId: ownerId,
              publishedAt: TEST_PUBLISHED_AT,
              visibility: "COMMUNITY",
            })
            const result = yield* runPolicySuccess(
              Policies.publications.canView(publication),
              session,
            )
            return !result
          }),
      ),
    )

    it.effect("private publications are not viewable by non-owners", () =>
      assertPropertyEffect(
        FastCheck.tuple(accountSessionArbitrary, personIdArbitrary),
        ([session, otherPersonId]) =>
          Effect.gen(function* () {
            if (session.personId === otherPersonId) return true
            const publication = CorePublicationMetadata.make({
              handle: TEST_HANDLE,
              ownerProfileId: otherPersonId,
              publishedAt: TEST_PUBLISHED_AT,
              visibility: "PRIVATE",
            })
            const result = yield* runPolicySuccess(
              Policies.publications.canView(publication),
              session,
            )
            return !result
          }),
      ),
    )

    it.effect("public publication viewing is monotonic", () =>
      assertPropertyEffect(
        FastCheck.tuple(accountSessionArbitrary, personIdArbitrary),
        ([baseSession, ownerId]) =>
          Effect.gen(function* () {
            const publication = CorePublicationMetadata.make({
              handle: TEST_HANDLE,
              ownerProfileId: ownerId,
              publishedAt: TEST_PUBLISHED_AT,
              visibility: "PUBLIC",
            })
            const results = yield* Effect.all(
              ACCESS_LEVEL_ORDER.map((level) =>
                runPolicySuccess(
                  Policies.publications.canView(publication),
                  sessionWithAccessLevel(baseSession, level),
                ),
              ),
              { concurrency: "unbounded" },
            )
            return results.every(
              (result, index) =>
                result ||
                results.slice(0, index).every((previousResult) => previousResult === false),
            )
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
            const managerMembership = session.memberships.find((m) => m.accessLevel === "MANAGER")
            if (managerMembership === undefined) return false
            return yield* runPolicySuccess(
              Policies.organizations.canDelete(managerMembership.organizationId),
              session,
            )
          }),
      ),
    )

    it.effect("public organization members are viewable by anyone", () =>
      assertPropertyEffect(sessionArbitrary, (session) =>
        Effect.gen(function* () {
          const orgId = yield* IdGen.make(OrganizationId)
          const org = OrganizationRow.make({
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
          const org = OrganizationRow.make({
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

    it.effect("editors can create organization publications", () =>
      assertPropertyEffect(
        memberWithLevel("EDITOR", trustedAccountSessionArbitrary),
        ({ session, orgId }) =>
          Effect.gen(function* () {
            const publication = CorePublicationMetadata.make({
              handle: TEST_HANDLE,
              ownerProfileId: orgId,
              publishedAt: TEST_PUBLISHED_AT,
              visibility: "PUBLIC",
            })
            return yield* runPolicySuccess(Policies.publications.canCreate(publication), session)
          }),
      ),
    )

    it.effect("editors can edit organization publications", () =>
      assertPropertyEffect(
        memberWithLevel("EDITOR", trustedAccountSessionArbitrary),
        ({ session, orgId }) =>
          Effect.gen(function* () {
            const publication = CorePublicationMetadata.make({
              handle: TEST_HANDLE,
              ownerProfileId: orgId,
              publishedAt: TEST_PUBLISHED_AT,
              visibility: "PUBLIC",
            })
            return yield* runPolicySuccess(Policies.publications.canEdit(publication), session)
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

    it.effect("viewers cannot create organization publications", () =>
      assertPropertyEffect(memberWithLevel("VIEWER"), ({ session, orgId }) =>
        Effect.gen(function* () {
          const publication = CorePublicationMetadata.make({
            handle: TEST_HANDLE,
            ownerProfileId: orgId,
            publishedAt: TEST_PUBLISHED_AT,
            visibility: "PUBLIC",
          })
          const canCreate = yield* runPolicySuccess(
            Policies.publications.canCreate(publication),
            session,
          )
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
    it.effect("publication owner + org member has both permissions", () =>
      assertPropertyEffect(trustedAccountSessionArbitrary, (session) =>
        Effect.gen(function* () {
          const orgId = yield* IdGen.make(OrganizationId)
          const sessionWithMembership = sessionWithOrgMembership(session, orgId, "EDITOR")

          const ownPublication = CorePublicationMetadata.make({
            handle: TEST_HANDLE,
            ownerProfileId: session.personId,
            publishedAt: TEST_PUBLISHED_AT,
            visibility: "PRIVATE",
          })
          const canEditOwn = yield* runPolicySuccess(
            Policies.publications.canEdit(ownPublication),
            sessionWithMembership,
          )
          if (canEditOwn === false) return false

          const orgPublication = CorePublicationMetadata.make({
            handle: TEST_HANDLE,
            ownerProfileId: orgId,
            publishedAt: TEST_PUBLISHED_AT,
            visibility: "PUBLIC",
          })
          const canEditOrg = yield* runPolicySuccess(
            Policies.publications.canEdit(orgPublication),
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

          const sessionWithMemberships = AccountSession.make({
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

  describe("wiki articles", () => {
    it.effect("trusted users can create wiki articles", () =>
      propertyWithPrecondition(accountSessionArbitrary, isTrustedOrHigher, (session) =>
        runPolicySuccess(Policies.wiki.canCreate, session),
      ),
    )

    it.effect("trusted users can revise wiki articles", () =>
      propertyWithPrecondition(accountSessionArbitrary, isTrustedOrHigher, (session) =>
        runPolicySuccess(Policies.wiki.canRevise, session),
      ),
    )

    it.effect("newcomers cannot create wiki articles", () =>
      propertyWithPrecondition(accountSessionArbitrary, isNewcomer, (session) =>
        Effect.map(runPolicySuccess(Policies.wiki.canCreate, session), (allowed) => !allowed),
      ),
    )

    it.effect("blocked users cannot create wiki articles", () =>
      propertyWithPrecondition(accountSessionArbitrary, isBlocked, (session) =>
        Effect.map(runPolicySuccess(Policies.wiki.canCreate, session), (allowed) => !allowed),
      ),
    )

    it.effect("blocked users cannot revise wiki articles", () =>
      propertyWithPrecondition(accountSessionArbitrary, isBlocked, (session) =>
        Effect.map(runPolicySuccess(Policies.wiki.canRevise, session), (allowed) => !allowed),
      ),
    )

    it.effect("visitors cannot create wiki articles", () =>
      assertPropertyEffect(visitorSessionArbitrary, (session) =>
        Effect.map(runPolicySuccess(Policies.wiki.canCreate, session), (allowed) => !allowed),
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
        runPolicySuccess(Policies.wiki.canBookmark, session),
      ),
    )

    it.effect("visitors cannot create bookmarks", () =>
      assertPropertyEffect(visitorSessionArbitrary, (session) =>
        Effect.map(runPolicySuccess(Policies.wiki.canBookmark, session), (allowed) => !allowed),
      ),
    )

    it.effect("newcomers cannot create bookmarks", () =>
      propertyWithPrecondition(accountSessionArbitrary, isNewcomer, (session) =>
        Effect.map(runPolicySuccess(Policies.wiki.canBookmark, session), (allowed) => !allowed),
      ),
    )

    it.effect("blocked users cannot create bookmarks", () =>
      propertyWithPrecondition(accountSessionArbitrary, isBlocked, (session) =>
        Effect.map(runPolicySuccess(Policies.wiki.canBookmark, session), (allowed) => !allowed),
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
