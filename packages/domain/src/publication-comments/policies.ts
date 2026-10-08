import { authenticatedPolicy, allow, deny, platformPermission } from "../authorization/policy.js"
import type { ProfileId } from "../common/ids.js"

const isPublicationCommentOwner = (ownerProfileId: ProfileId) =>
  authenticatedPolicy((session) =>
    session.personId === ownerProfileId
      ? allow(session)
      : deny("Only the publication comment owner can modify this publication comment"),
  )

export const publicationCommentsPolicies = {
  canCreate: platformPermission("publication-comments:create"),
  canCensor: platformPermission("publication-comments:censor"),
  canEdit: isPublicationCommentOwner,
  canDelete: isPublicationCommentOwner,
}
