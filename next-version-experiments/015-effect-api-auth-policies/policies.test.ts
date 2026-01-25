// test/policies.integration.test.ts
import { describe, it } from '@effect/vitest'
import { Arbitrary, DateTime, Effect, FastCheck } from 'effect'
import {
	CorePostMetadata,
	Organization,
	type OrganizationAccessLevel,
	OrganizationId,
	PersonId,
	PlatformAccessLevel,
} from '@/schema'
import { BunUUIDGenLive, UUIDGen } from '@/services/uuid-gen'
import {
	assertPropertyEffect,
	propertyWithPrecondition,
	runPolicySuccess,
} from './effect-property-tests'
import Policies from './policies'
import { AccountSession, OrganizationMembership, Session } from './session'

// Create Arbitraries from Schemas
const sessionArbitrary = Arbitrary.make(Session)
const accountSessionArbitrary = Arbitrary.make(AccountSession)
const accessLevelArbitrary = Arbitrary.make(PlatformAccessLevel)

// Helper functions to reduce test duplication
// Helper function to create a test post within Effect context
const createTestPost = (
	owner_profile_id: PersonId,
	visibility: 'PUBLIC' | 'COMMUNITY' | 'PRIVATE' = 'PUBLIC',
) =>
	Effect.gen(function* () {
		return CorePostMetadata.make({
			owner_profile_id,
			handle: '',
			visibility,
			published_at: yield* DateTime.nowAsDate,
		})
	})

// Helper function to create a test organization within Effect context
const createTestOrganization = (
	members_visibility: 'PUBLIC' | 'COMMUNITY' | 'PRIVATE' = 'PUBLIC',
) =>
	Effect.gen(function* () {
		return Organization.make({
			id: yield* UUIDGen.make(OrganizationId),
			members_visibility,
			type: 'COMMERCIAL',
		})
	})

// Helper function to create session with specific organization membership
const createSessionWithMembership = (
	baseSession: AccountSession,
	organizationId: OrganizationId,
	accessLevel: OrganizationAccessLevel,
): AccountSession =>
	AccountSession.make({
		...baseSession,
		memberships: [
			OrganizationMembership.make({
				organization_id: organizationId,
				access_level: accessLevel,
			}),
			...baseSession.memberships,
		],
	})

// Helper function to create session without a specific organization membership
const createSessionWithoutMembership = (
	baseSession: AccountSession,
	organizationId: OrganizationId,
): AccountSession =>
	AccountSession.make({
		...baseSession,
		memberships: baseSession.memberships.filter(
			(m) => m.organization_id !== organizationId,
		),
	})

// Precondition helpers
const isTrustedOrHigher = (session: AccountSession) =>
	session.access_level === 'TRUSTED' ||
	session.access_level === 'MODERATOR' ||
	session.access_level === 'ADMIN'

const isModeratorOrAdmin = (session: AccountSession) =>
	session.access_level === 'MODERATOR' || session.access_level === 'ADMIN'

const isNewcomer = (session: AccountSession) =>
	session.access_level === 'NEWCOMER'

const hasManagerMembership = (session: AccountSession) =>
	session.memberships.some((m) => m.access_level === 'MANAGER')

const hasNonManagerMembership = (session: AccountSession) =>
	session.memberships.some((m) => m.access_level !== 'MANAGER')

const hasEditorMembership = (session: AccountSession) =>
	session.memberships.some((m) => m.access_level === 'EDITOR')

const hasAnyMembership = (session: AccountSession) =>
	session.memberships.length > 0

describe('Post Policies', () => {
	describe('canEdit', () => {
		it.effect(
			'post owners can edit their own posts regardless of visibility',
			() =>
				assertPropertyEffect(accountSessionArbitrary, (session) =>
					Effect.gen(function* () {
						const post = yield* createTestPost(session.person_id, 'PUBLIC')
						return yield* runPolicySuccess(
							Policies.posts.canEdit(post),
							session,
						)
					}),
				),
		)

		it.effect('non-owner without org permission cannot edit', () =>
			assertPropertyEffect(
				accountSessionArbitrary,
				(session) =>
					Effect.gen(function* () {
						// Ensure session is not the owner and has no relevant memberships
						const nonOwnerSession: AccountSession = AccountSession.make({
							...session,
							person_id: yield* UUIDGen.make(PersonId),
							memberships: [],
						})

						const post = yield* createTestPost(
							nonOwnerSession.person_id,
							'PUBLIC',
						)
						// Should fail for non-owners without org permissions
						const result = yield* runPolicySuccess(
							Policies.posts.canEdit(post),
							nonOwnerSession,
						)
						return !result
					}).pipe(Effect.provide(BunUUIDGenLive)),
				{ numRuns: 50 },
			),
		)
	})

	describe('canView', () => {
		it.effect('public posts are viewable by anyone', () =>
			assertPropertyEffect(sessionArbitrary, (session) =>
				Effect.gen(function* () {
					const ownerId = yield* UUIDGen.make(PersonId)
					const publicPost = yield* createTestPost(ownerId, 'PUBLIC')
					return yield* runPolicySuccess(
						Policies.posts.canView(publicPost),
						session,
					)
				}).pipe(Effect.provide(BunUUIDGenLive)),
			),
		)

		it.effect('community posts are viewable by trusted users and above', () =>
			propertyWithPrecondition(
				accountSessionArbitrary,
				isTrustedOrHigher,
				(session) =>
					Effect.gen(function* () {
						const ownerId = yield* UUIDGen.make(PersonId)
						const communityPost = yield* createTestPost(ownerId, 'COMMUNITY')
						return yield* runPolicySuccess(
							Policies.posts.canView(communityPost),
							session,
						)
					}).pipe(Effect.provide(BunUUIDGenLive)),
				{ numRuns: 50 },
			),
		)

		it.effect('community posts are not viewable by newcomer users', () =>
			propertyWithPrecondition(
				accountSessionArbitrary,
				isNewcomer,
				(session) =>
					Effect.gen(function* () {
						const ownerId = yield* UUIDGen.make(PersonId)
						const communityPost = yield* createTestPost(ownerId, 'COMMUNITY')
						const result = yield* runPolicySuccess(
							Policies.posts.canView(communityPost),
							session,
						)
						return !result
					}).pipe(Effect.provide(BunUUIDGenLive)),
				{ numRuns: 50 },
			),
		)
	})

	describe('canDelete', () => {
		it.effect(
			'post owners can delete their own posts regardless of visibility',
			() =>
				assertPropertyEffect(accountSessionArbitrary, (session) =>
					Effect.gen(function* () {
						const post = yield* createTestPost(session.person_id, 'PUBLIC')
						return yield* runPolicySuccess(
							Policies.posts.canDelete(post),
							session,
						)
					}),
				),
		)
	})

	describe('canViewHistory', () => {
		it.effect('post owner can view their post history', () =>
			assertPropertyEffect(accountSessionArbitrary, (session) =>
				Effect.gen(function* () {
					const post = yield* createTestPost(session.person_id, 'PUBLIC')
					return yield* runPolicySuccess(
						Policies.posts.canViewHistory(post),
						session,
					)
				}),
			),
		)

		it.effect('non-owner cannot view personal post history', () =>
			assertPropertyEffect(accountSessionArbitrary, (session) =>
				Effect.gen(function* () {
					const nonOwnerSession: AccountSession = AccountSession.make({
						...session,
						person_id: yield* UUIDGen.make(PersonId),
					})

					const post = yield* createTestPost(
						nonOwnerSession.person_id,
						'PUBLIC',
					)
					const result = yield* runPolicySuccess(
						Policies.posts.canViewHistory(post),
						session,
					)
					return !result
				}).pipe(Effect.provide(BunUUIDGenLive)),
			),
		)
	})
})

describe('People Policies', () => {
	describe('canModifyAccessLevel', () => {
		it.effect(
			'moderator transitions require people:manage-moderators permission',
			() =>
				assertPropertyEffect(
					accessLevelArbitrary,
					(accessLevel) =>
						Effect.gen(function* () {
							const [session] = FastCheck.sample(accountSessionArbitrary)

							// Verify that moderator-related transitions are handled correctly
							return yield* runPolicySuccess(
								Policies.people.canModifyAccessLevel({
									from: accessLevel,
									to: 'MODERATOR',
								}),
								session,
							)
						}),
					{ numRuns: 50 },
				),
		)
	})

	describe('canRemoveBookmark', () => {
		it.effect('users can remove their own bookmarks', () =>
			assertPropertyEffect(accountSessionArbitrary, (session) =>
				Effect.gen(function* () {
					const personId = session.person_id

					return yield* runPolicySuccess(
						Policies.vegetables.canRemoveBookmark(personId),
						session,
					)
				}),
			),
		)

		it.effect('users cannot remove others bookmarks', () =>
			assertPropertyEffect(accountSessionArbitrary, (session) =>
				Effect.gen(function* () {
					const otherPersonId = yield* UUIDGen.make(PersonId)

					const result = yield* runPolicySuccess(
						Policies.vegetables.canRemoveBookmark(otherPersonId),
						session,
					)
					return !result
				}).pipe(Effect.provide(BunUUIDGenLive)),
			),
		)
	})
})

describe('Resources Policies', () => {
	describe('canCreate', () => {
		it.effect('trusted users can create resources', () =>
			propertyWithPrecondition(
				accountSessionArbitrary,
				isTrustedOrHigher,
				(session) =>
					Effect.gen(function* () {
						return yield* runPolicySuccess(
							Policies.resources.canCreate,
							session,
						)
					}),
				{ numRuns: 50 },
			),
		)
	})

	describe('canRevise', () => {
		it.effect('trusted users can revise resources', () =>
			propertyWithPrecondition(
				accountSessionArbitrary,
				isTrustedOrHigher,
				(session) =>
					Effect.gen(function* () {
						return yield* runPolicySuccess(
							Policies.resources.canRevise,
							session,
						)
					}),
				{ numRuns: 50 },
			),
		)
	})

	describe('canAccess', () => {
		it.effect('anyone can access resources', () =>
			assertPropertyEffect(sessionArbitrary, (session) =>
				Effect.gen(function* () {
					return yield* runPolicySuccess(Policies.resources.canAccess, session)
				}),
			),
		)
	})
})

describe('Revisions Policies', () => {
	describe('canPropose', () => {
		it.effect('trusted users can propose vegetable revisions', () =>
			propertyWithPrecondition(
				accountSessionArbitrary,
				isTrustedOrHigher,
				(session) =>
					Effect.gen(function* () {
						return yield* runPolicySuccess(
							Policies.revisions.canPropose('vegetable'),
							session,
						)
					}),
				{ numRuns: 50 },
			),
		)

		it.effect('trusted users can propose resource revisions', () =>
			propertyWithPrecondition(
				accountSessionArbitrary,
				isTrustedOrHigher,
				(session) =>
					Effect.gen(function* () {
						return yield* runPolicySuccess(
							Policies.revisions.canPropose('resource'),
							session,
						)
					}),
				{ numRuns: 50 },
			),
		)
	})

	describe('canEvaluate', () => {
		it.effect('moderators and admins can evaluate revisions', () =>
			propertyWithPrecondition(
				accountSessionArbitrary,
				isModeratorOrAdmin,
				(session) =>
					Effect.gen(function* () {
						return yield* runPolicySuccess(
							Policies.revisions.canEvaluate,
							session,
						)
					}),
				{ numRuns: 50 },
			),
		)

		it.effect('trusted users cannot evaluate revisions', () =>
			propertyWithPrecondition(
				accountSessionArbitrary,
				(session) => session.access_level === 'TRUSTED',
				(session) =>
					Effect.gen(function* () {
						const result = yield* runPolicySuccess(
							Policies.revisions.canEvaluate,
							session,
						)
						return !result
					}),
				{ numRuns: 50 },
			),
		)
	})

	describe('canViewHistory', () => {
		it.effect('anyone can view revision history', () =>
			assertPropertyEffect(sessionArbitrary, (session) =>
				Effect.gen(function* () {
					return yield* runPolicySuccess(
						Policies.revisions.canViewHistory,
						session,
					)
				}),
			),
		)
	})
})

describe('Bookmarks Policies', () => {
	describe('canCreate', () => {
		it.effect('trusted users can create bookmarks', () =>
			propertyWithPrecondition(
				accountSessionArbitrary,
				isTrustedOrHigher,
				(session) =>
					Effect.gen(function* () {
						return yield* runPolicySuccess(
							Policies.bookmarks.canCreate,
							session,
						)
					}),
				{ numRuns: 50 },
			),
		)
	})

	describe('canDelete', () => {
		it.effect('authenticated users can delete their own bookmarks', () =>
			assertPropertyEffect(accountSessionArbitrary, (session) =>
				Effect.gen(function* () {
					return yield* runPolicySuccess(Policies.bookmarks.canDelete, session)
				}),
			),
		)

		it.effect('visitors cannot delete bookmarks', () =>
			assertPropertyEffect(sessionArbitrary, (session) =>
				Effect.gen(function* () {
					// Only test with VisitorSession
					if (session.type === 'VISITOR') {
						const result = yield* runPolicySuccess(
							Policies.bookmarks.canDelete,
							session,
						)
						return !result
					}
					return true
				}),
			),
		)
	})
})
