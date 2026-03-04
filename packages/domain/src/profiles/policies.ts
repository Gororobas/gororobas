import {
  allow,
  and,
  authenticatedPolicy,
  deny,
  denyPolicy,
  or,
  organizationPermission,
  platformPermission,
  policy,
} from "../authorization/policy.js"
import { ProfileRow } from "./domain.js"

const isProfileOwner = (profile: Pick<ProfileRow, "id" | "type">) =>
  authenticatedPolicy((session) =>
    profile.type === "PERSON" && profile.id === session.personId ? allow(session) : deny(),
  )

export const profilePolicies = {
  canRead: (profile: Pick<ProfileRow, "visibility">) =>
    or(
      platformPermission("profiles:read:all"),
      policy((session) => (profile.visibility === "PUBLIC" ? allow(session) : deny())),
      and(
        platformPermission("profiles:read:community"),
        policy((session) => (profile.visibility === "COMMUNITY" ? allow(session) : deny())),
      ),
    ),
  canEdit: (profile: ProfileRow) =>
    or(
      // For personal profiles, must be the owner to edit
      isProfileOwner(profile),
      // For orgs, require permission
      profile.type === "ORGANIZATION"
        ? organizationPermission("organization:edit-profile", profile.id)
        : denyPolicy,
    ),
}
