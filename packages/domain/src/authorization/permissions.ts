/**
 * Permission definitions for platform and organization access control.
 */
import { HashSet, Schema } from "effect"

import type { OrganizationAccessLevel, PlatformAccessLevelOrVisitor } from "../common/enums.js"

export const PlatformPermission = Schema.Literals([
  "people:manage-community-access", // trusting newcomers or blocking members with community access
  "people:manage-moderators",
  "people:manage-admins",
  "revisions:evaluate",
  "posts:read:community",
  "posts:create:personal",
  "profiles:read:community",
  "profiles:read:all",
  "media:create",
  "media:censor",
  "vegetables:create",
  "vegetables:revise",
  "vegetables:main-photo:set",
  "vegetables:varieties:create",
  "vegetables:varieties:revise",
  "resources:create",
  "resources:revise",
  "organizations:create",
  "comments:create",
  "comments:censor",
  "bookmarks:create",
])
export type PlatformPermission = typeof PlatformPermission.Type

const PLATFORM_PERMISSIONS_BY_ACCESS_LEVEL: Record<
  PlatformAccessLevelOrVisitor,
  HashSet.HashSet<PlatformPermission>
> = {
  ADMIN: HashSet.fromIterable(PlatformPermission.literals),
  BLOCKED: HashSet.empty(),
  MODERATOR: HashSet.fromIterable([
    "people:manage-community-access",
    "revisions:evaluate",
    "posts:create:personal",
    "media:create",
    "posts:read:community",
    "profiles:read:community",
    "vegetables:create",
    "vegetables:revise",
    "resources:create",
    "resources:revise",
    "organizations:create",
    "comments:create",
    "bookmarks:create",
  ]),
  NEWCOMER: HashSet.fromIterable(["posts:create:personal", "media:create"]),
  COMMUNITY: HashSet.fromIterable([
    "organizations:create",
    "posts:create:personal",
    "media:create",
    "posts:read:community",
    "profiles:read:community",
    "vegetables:create",
    "vegetables:revise",
    "resources:create",
    "resources:revise",
    "comments:create",
    "bookmarks:create",
  ]),
  VISITOR: HashSet.empty(),
}

export const OrganizationPermission = Schema.Literals([
  "organization:delete",
  "organization:manage-visibility",
  "organization:edit-profile",
  "members:invite",
  "members:remove",
  "members:manage",
  "members:view",
  "posts:create:organization",
  "posts:edit",
  "posts:delete",
  "posts:view",
])
export type OrganizationPermission = typeof OrganizationPermission.Type

const ORGANIZATION_PERMISSIONS_BY_ACCESS_LEVEL: Record<
  OrganizationAccessLevel,
  HashSet.HashSet<OrganizationPermission>
> = {
  EDITOR: HashSet.fromIterable([
    "organization:edit-profile",
    "posts:create:organization",
    "posts:edit",
    "posts:delete",
    "posts:view",
    "members:view",
  ]),
  MANAGER: HashSet.fromIterable(OrganizationPermission.literals),
  VIEWER: HashSet.fromIterable(["posts:view", "members:view"]),
}

export function platformPermissionsFor(
  accessLevel: PlatformAccessLevelOrVisitor,
): HashSet.HashSet<PlatformPermission> {
  return PLATFORM_PERMISSIONS_BY_ACCESS_LEVEL[accessLevel]
}

export function organizationPermissionsFor(
  accessLevel: OrganizationAccessLevel,
): HashSet.HashSet<OrganizationPermission> {
  return ORGANIZATION_PERMISSIONS_BY_ACCESS_LEVEL[accessLevel]
}
