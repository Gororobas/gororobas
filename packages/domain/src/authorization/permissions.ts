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
  "publications:read:community",
  "publications:create:personal",
  "profiles:read:community",
  "profiles:read:all",
  "media:create",
  "media:censor",
  "vegetables:create",
  "vegetables:revise",
  "vegetables:main-photo:set",
  "vegetables:varieties:create",
  "vegetables:varieties:revise",
  "wiki-article:create",
  "wiki-article:revise",
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
    "publications:create:personal",
    "media:create",
    "publications:read:community",
    "profiles:read:community",
    "vegetables:create",
    "vegetables:revise",
    "wiki-article:create",
    "wiki-article:revise",
    "resources:create",
    "resources:revise",
    "organizations:create",
    "comments:create",
    "bookmarks:create",
  ]),
  NEWCOMER: HashSet.fromIterable(["publications:create:personal", "media:create"]),
  COMMUNITY: HashSet.fromIterable([
    "organizations:create",
    "publications:create:personal",
    "media:create",
    "publications:read:community",
    "profiles:read:community",
    "vegetables:create",
    "vegetables:revise",
    "wiki-article:create",
    "wiki-article:revise",
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
  "publications:create:organization",
  "publications:edit",
  "publications:delete",
  "publications:view",
])
export type OrganizationPermission = typeof OrganizationPermission.Type

const ORGANIZATION_PERMISSIONS_BY_ACCESS_LEVEL: Record<
  OrganizationAccessLevel,
  HashSet.HashSet<OrganizationPermission>
> = {
  EDITOR: HashSet.fromIterable([
    "organization:edit-profile",
    "publications:create:organization",
    "publications:edit",
    "publications:delete",
    "publications:view",
    "members:view",
  ]),
  MANAGER: HashSet.fromIterable(OrganizationPermission.literals),
  VIEWER: HashSet.fromIterable(["publications:view", "members:view"]),
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
