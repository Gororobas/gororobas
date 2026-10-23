import { or, platformPermission } from "../authorization/policy.js"

export const moderationPolicies = {
  /** Censor or reapprove publications, publication comments and media assets. */
  canModerateContent: platformPermission("content:moderate"),
  /** Each section of the queue is further limited to the permission that resolves it. */
  canViewQueue: or(
    platformPermission("people:manage-community-access"),
    platformPermission("revisions:evaluate"),
  ),
}
