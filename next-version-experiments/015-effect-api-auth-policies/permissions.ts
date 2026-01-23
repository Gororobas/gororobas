import { Schema } from 'effect'
import type {
	OrganizationAccessLevel,
	PlatformAccessLevelOrVisitor,
} from '@/schema'

export const PlatformPermission = Schema.Literal(
	'people:manage-newcomers',
	'people:manage-blocked',
	'people:manage-moderators',
	'people:manage-admins',
	'revisions:evaluate',
	'posts:read:community',
	'posts:create:personal',
	'profiles:read:community',
	'media:create',
	'media:censor',
	'vegetables:create',
	'vegetables:revise',
	'vegetables:main-photo:set',
	'vegetables:varieties:create',
	'vegetables:varieties:revise',
	'resources:create',
	'resources:revise',
	'organizations:create',
	'comments:create',
	'comments:censor',
	'bookmarks:create',
)
export type PlatformPermission = typeof PlatformPermission.Type

const PLATFORM_PERMISSIONS_BY_ACCESS_LEVEL: Record<
	PlatformAccessLevelOrVisitor,
	ReadonlySet<PlatformPermission>
> = {
	ADMIN: new Set(PlatformPermission.literals),
	MODERATOR: new Set([
		'people:manage-newcomers',
		'people:manage-blocked',
		'revisions:evaluate',
		'posts:create:personal',
		'media:create',
		'posts:read:community',
		'vegetables:create',
		'vegetables:revise',
		'resources:create',
		'resources:revise',
	]),
	TRUSTED: new Set([
		'organizations:create',
		'posts:create:personal',
		'media:create',
		'posts:read:community',
		'vegetables:create',
		'vegetables:revise',
		'resources:create',
		'resources:revise',
	]),
	NEWCOMER: new Set(['posts:create:personal', 'media:create']),
	BLOCKED: new Set([]),
	VISITOR: new Set([]),
}

export const OrganizationPermission = Schema.Literal(
	'organizations:delete',
	'organizations:manage-visibility',
	'organizations:edit-profile',
	'members:invite',
	'members:remove',
	'members:manage',
	'members:view',
	'posts:create:organization',
	'posts:edit',
	'posts:delete',
	'posts:view',
)
export type OrganizationPermission = typeof OrganizationPermission.Type

const ORGANIZATION_PERMISSIONS_BY_ACCESS_LEVEL: Record<
	OrganizationAccessLevel,
	ReadonlySet<OrganizationPermission>
> = {
	MANAGER: new Set(OrganizationPermission.literals),
	EDITOR: new Set([
		'organizations:edit-profile',
		'posts:create:organization',
		'posts:edit',
		'posts:delete',
		'posts:view',
		'members:view',
	]),
	VIEWER: new Set(['posts:view', 'members:view']),
}

export function platformPermissionsFor(
	accessLevel: PlatformAccessLevelOrVisitor,
): ReadonlySet<PlatformPermission> {
	return PLATFORM_PERMISSIONS_BY_ACCESS_LEVEL[accessLevel]
}

export function orgPermissionsFor(
	accessLevel: OrganizationAccessLevel,
): ReadonlySet<OrganizationPermission> {
	return ORGANIZATION_PERMISSIONS_BY_ACCESS_LEVEL[accessLevel]
}
