import { authenticatedPolicy, allow, deny, platformPermission } from "../authorization/policy.js"
import type { ProfileId } from "../common/ids.js"

const isCommentOwner = (ownerProfileId: ProfileId) =>
  authenticatedPolicy((session) =>
    session.personId === ownerProfileId
      ? allow(session)
      : deny("Only the comment owner can modify this comment"),
  )

export const commentsPolicies = {
  canCreate: platformPermission("comments:create"),
  canCensor: platformPermission("comments:censor"),
  canEdit: isCommentOwner,
  canDelete: isCommentOwner,
}
