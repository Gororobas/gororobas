import { msg } from '@lingui/core/macro'
import { Effect, Schema } from 'effect'
import type { CorePostMetadata, PersonId, PlatformAccessLevel } from '@/schema'
import { type Organization, OrganizationId } from '@/schema'

import {
	allow,
	assertAuthenticated,
	assertTrustedPerson,
	authenticatedPolicy,
	check,
	deny,
	or,
	organizationPermission,
	platformPermission,
	policy,
} from './policy.internal'
import { isAccountSession } from './session'

// Common sub-policies for reusability and readability
const isPostOwner = (post: CorePostMetadata) =>
	authenticatedPolicy((session) =>
		post.owner_profile_id === session.person_id ? allow(session) : deny(),
	)

const isPersonalPostPublic = (post: CorePostMetadata) =>
	or(
		policy((session) =>
			post.visibility === 'PUBLIC' ? allow(session) : deny(),
		),
		policy(() =>
			post.visibility === 'COMMUNITY'
				? Effect.map(assertTrustedPerson, allow)
				: deny(),
		),
	)

const postsPolicies = {
	canCreate: (post: CorePostMetadata) =>
		or(
			// If creating in the user's profile
			isPostOwner(post),
			// Or in an org they have the permissions for
			organizationPermission(
				'posts:create:organization',
				Schema.decodeSync(OrganizationId)(post.owner_profile_id),
			),
		),

	canEdit: (post: CorePostMetadata) =>
		or(
			// Post owners are always allowed to edit
			isPostOwner(post),

			// If the owner profile is any other, the user can only edit the post
			// if it's part of an org and they have the require permission
			organizationPermission(
				'posts:edit',
				Schema.decodeSync(OrganizationId)(post.owner_profile_id),
			),
		),

	canDelete: (post: CorePostMetadata) =>
		or(
			// Post authors are always allowed to delete
			isPostOwner(post),
			// Or if part of an org and they have permission
			organizationPermission(
				'posts:delete',
				Schema.decodeSync(OrganizationId)(post.owner_profile_id),
			),
		),

	canView: (post: CorePostMetadata) =>
		or(
			isPersonalPostPublic(post),
			organizationPermission(
				'posts:view',
				Schema.decodeSync(OrganizationId)(post.owner_profile_id),
			),
		),

	canViewHistory: (post: CorePostMetadata) =>
		or(
			// Only author can see the history of personal posts
			isPostOwner(post),
			// For orgs, any member can view
			organizationPermission(
				'members:view',
				Schema.decodeSync(OrganizationId)(post.owner_profile_id),
			),
		),

	// Only applicable to org-owned posts
	canViewContributors: (post: CorePostMetadata) =>
		or(
			// For orgs, any member can view
			organizationPermission(
				'members:view',
				Schema.decodeSync(OrganizationId)(post.owner_profile_id),
			),
		),
}

const peoplePolicies = {
	canModifyAccessLevel: ({
		from,
		to,
	}: {
		from: PlatformAccessLevel
		to: PlatformAccessLevel
	}) => {
		if (to === 'MODERATOR' || from === 'MODERATOR') {
			return platformPermission('people:manage-moderators')
		}

		if (to === 'ADMIN' || from === 'ADMIN') {
			return platformPermission('people:manage-admins')
		}

		return platformPermission('people:manage-trusted')
	},

	// @TODO need to check the person's memberships and ensure they aren't sole-admins of any organization with 2+ members
	// If they're admins of orgs they're the only members, these orgs should be returned in allow() so they can be deleted
	canDeleteOwnAccount: assertAuthenticated,
}

const organizationsPolicies = {
	canCreate: platformPermission('organizations:create'),

	canEditProfile: (organization_id: OrganizationId) =>
		organizationPermission('organization:edit-profile', organization_id),

	canDelete: (organization_id: OrganizationId) =>
		organizationPermission('organization:delete', organization_id),

	canInviteMember: (organization_id: OrganizationId) =>
		organizationPermission('members:invite', organization_id),

	canRemoveMember: (organization_id: OrganizationId) =>
		organizationPermission('members:remove', organization_id),

	canManageMemberPermissions: (organization_id: OrganizationId) =>
		organizationPermission('members:manage', organization_id),

	canViewMembers: (organization: Organization) =>
		or(
			policy((session) =>
				organization.members_visibility === 'PUBLIC' ? allow(session) : deny(),
			),
			policy((_session) =>
				organization.members_visibility === 'COMMUNITY'
					? Effect.map(assertTrustedPerson, allow)
					: deny(),
			),
			organizationPermission('members:view', organization.id),
		),

	canSetVisibility: (organization_id: OrganizationId) =>
		organizationPermission('organization:manage-visibility', organization_id),

	canLeave: (organization_id: OrganizationId) =>
		policy((session) => {
			if (isAccountSession(session)) {
				const membership = session.memberships.find(
					(m) => m.organization_id === organization_id,
				)
				if (membership) return allow(true)
			}
			return deny(msg`You are not a member of this organization`)
		}),
}

const commentsPolicies = {
	canCreate: platformPermission('comments:create'),
	canCensor: platformPermission('comments:censor'),
}

const mediaPolicies = {
	canCreate: platformPermission('media:create'),
	canCensor: platformPermission('media:censor'),
	canAttachToVegetable: platformPermission('vegetables:revise'),
}

const vegetablesPolicies = {
	canCreate: platformPermission('vegetables:create'),
	canRevise: platformPermission('vegetables:revise'),
	canCreateVariety: platformPermission('vegetables:varieties:create'),
	canSetMainPhoto: platformPermission('vegetables:main-photo:set'),
	canBookmark: platformPermission('bookmarks:create'),
	canRemoveBookmark: (person_id: PersonId) =>
		authenticatedPolicy((session) =>
			session.person_id === person_id
				? allow(session)
				: deny(msg`Must be the bookmark's owner to delete it`),
		),
}

const resourcesPolicies = {
	canCreate: platformPermission('resources:create'),
	canRevise: platformPermission('resources:revise'),
	canLinkToVegetables: platformPermission('resources:revise'),
	canComment: platformPermission('comments:create'),
	canCensorComment: platformPermission('comments:censor'),
	canAccess: policy((_session) => allow(true)),
}

const revisionsPolicies = {
	canPropose: (entity_type: 'vegetable' | 'resource') =>
		platformPermission(
			entity_type === 'vegetable' ? 'vegetables:revise' : 'resources:revise',
		),

	canEvaluate: platformPermission('revisions:evaluate'),
	canViewHistory: policy((_session) => allow(true)),
}

const bookmarksPolicies = {
	canCreate: platformPermission('bookmarks:create'),
	canDelete: assertAuthenticated,
}

const Policies = {
	check,

	people: peoplePolicies,
	organizations: organizationsPolicies,
	posts: postsPolicies,
	comments: commentsPolicies,
	media: mediaPolicies,
	vegetables: vegetablesPolicies,
	resources: resourcesPolicies,
	revisions: revisionsPolicies,
	bookmarks: bookmarksPolicies,
}

export default Policies
