import { Effect } from "effect"

import {
  assertNonBlockedPerson,
  authenticatedPolicy,
  allow,
  deny,
  platformPermission,
} from "../authorization/policy.js"
import type { ProfileId } from "../common/ids.js"

const isPublicationCommentOwner = (ownerProfileId: ProfileId) =>
  authenticatedPolicy((session) =>
    session.personId === ownerProfileId
      ? allow(session)
      : deny("Only the publication comment owner can modify this publication comment"),
  )

export const publicationCommentsPolicies = {
  canCreate: platformPermission("publication-comments:create"),
  /** Blocked people can't rewrite their comments, though they can still delete them. */
  canEdit: (ownerProfileId: ProfileId) =>
    assertNonBlockedPerson.pipe(Effect.flatMap(() => isPublicationCommentOwner(ownerProfileId))),
  canDelete: isPublicationCommentOwner,
  /** Authors keep seeing their publication comments while censored; every other reader loses access. */
  canViewCensored: isPublicationCommentOwner,
}
