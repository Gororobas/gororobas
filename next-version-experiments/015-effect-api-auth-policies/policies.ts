import { msg } from '@lingui/core/macro'
import { Effect, Schema } from 'effect'
import type { CorePostMetadata, PersonId } from '@/schema'
import { type Organization, OrganizationId } from '@/schema'

import {
	allow,
	assertAuthenticated,
	assertTrustedPerson,
	authenticatedPolicy,
	deny,
	or,
	organizationPermission,
	platformPermission,
	policy,
	Unauthorized,
} from './policy.internal'

const isPostOwner = (post: CorePostMetadata) =>
	authenticatedPolicy((session) =>
		post.owner_profile_id === session.person_id ? allow(session) : deny(),
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

	canDelete: (author_id: PersonId, organization_id?: OrganizationId) =>
		policy(() =>
			Effect.gen(function* () {
				const session = yield* assertAuthenticated
				if (author_id === session.person_id) return allow(true)

				if (organization_id)
					return (yield* organizationPermission(
						'posts:delete',
						organization_id,
					)) as any

				return deny(msg`You cannot delete this post`)
			}),
		),

	canView: policy((_session) => allow(true)),
}

const peoplePolicies = {
	canUpdateProfile: policy((session) =>
		session.type === 'account' ? allow(true) : deny(msg`Must be logged in`),
	),

	canChangeHandle: policy((session) =>
		session.type === 'account' ? allow(true) : deny(msg`Must be logged in`),
	),

	canSetProfileVisibility: policy((session) =>
		session.type === 'account' ? allow(true) : deny(msg`Must be logged in`),
	),

	canPromoteToTrusted: policy((session) =>
		session.type === 'account' &&
		(session.access_level === 'ADMIN' || session.access_level === 'MODERATOR')
			? allow(true)
			: deny(msg`Only admins or moderators can promote people`),
	),

	canDemoteFromTrusted: policy((session) =>
		session.type === 'account' && session.access_level === 'ADMIN'
			? allow(true)
			: deny(msg`Only admins can demote people`),
	),

	canPromoteToModerator: policy((session) =>
		session.type === 'account' && session.access_level === 'ADMIN'
			? allow(true)
			: deny(msg`Only admins can promote moderators`),
	),

	canDemoteFromModerator: policy((session) =>
		session.type === 'account' && session.access_level === 'ADMIN'
			? allow(true)
			: deny(msg`Only admins can demote moderators`),
	),

	canBlock: policy((session) =>
		session.type === 'account' &&
		(session.access_level === 'ADMIN' || session.access_level === 'MODERATOR')
			? allow(true)
			: deny(msg`Only admins or moderators can block people`),
	),

	canDeleteOwnAccount: policy((session) =>
		session.type === 'account' ? allow(true) : deny(msg`Must be logged in`),
	),
}

const organizationsPolicies = {
	canCreate: platformPermission('organizations:create'),

	canEditProfile: (organization_id: OrganizationId) =>
		organizationPermission('organizations:edit-profile', organization_id),

	canDelete: (organization_id: OrganizationId) =>
		organizationPermission('organizations:delete', organization_id),

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
		organizationPermission('organizations:manage-visibility', organization_id),

	canLeave: (organization_id: OrganizationId) =>
		policy((session) => {
			if (session.type === 'account') {
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
	canRemoveBookmark: assertAuthenticated,
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
	assertAuthenticated,
	organizationPermission,
	platformPermission,
	Unauthorized,

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
