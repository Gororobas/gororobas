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
  canEdit: isPublicationCommentOwner,
  canDelete: isPublicationCommentOwner,
  /** Authors keep seeing their publication comments while censored; every other reader loses access. */
  canViewCensored: isPublicationCommentOwner,
}
