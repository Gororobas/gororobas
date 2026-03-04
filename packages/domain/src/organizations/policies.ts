import { Effect } from "effect"

import {
  allow,
  assertTrustedPerson,
  deny,
  or,
  organizationPermission,
  platformPermission,
  policy,
} from "../authorization/policy.js"
import { getSessionOrganizationPermissions, isAccountSession } from "../authorization/session.js"
import { OrganizationId } from "../common/ids.js"
import type { OrganizationRow } from "./domain.js"

export const organizationsPolicies = {
  canCreate: platformPermission("organizations:create"),

  canDelete: (organization_id: OrganizationId) =>
    organizationPermission("organization:delete", organization_id),

  canEditProfile: (organization_id: OrganizationId) =>
    organizationPermission("organization:edit-profile", organization_id),

  canInviteMember: (organization_id: OrganizationId) =>
    organizationPermission("members:invite", organization_id),

  canLeave: (organization_id: OrganizationId) =>
    policy((session) => {
      if (isAccountSession(session)) {
        const orgPermissions = getSessionOrganizationPermissions(session)
        if (orgPermissions[organization_id]) return allow(true)
      }
      return deny("You are not a member of this organization")
    }),

  canManageMemberPermissions: (organization_id: OrganizationId) =>
    organizationPermission("members:manage", organization_id),

  canRemoveMember: (organization_id: OrganizationId) =>
    organizationPermission("members:remove", organization_id),

  canSetVisibility: (organization_id: OrganizationId) =>
    organizationPermission("organization:manage-visibility", organization_id),

  canViewMembers: (organization: OrganizationRow) =>
    or(
      policy((session) => (organization.membersVisibility === "PUBLIC" ? allow(session) : deny())),
      policy((_session) =>
        organization.membersVisibility === "COMMUNITY"
          ? Effect.map(assertTrustedPerson, allow)
          : deny(),
      ),
      organizationPermission("members:view", organization.id),
    ),
}
