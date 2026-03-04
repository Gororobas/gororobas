import {
  allow,
  authenticatedPolicy,
  deny,
  platformPermission,
  policy,
} from "../authorization/policy.js"
import { PersonId } from "../common/ids.js"

export const resourcesPolicies = {
  canAccess: policy((_session) => allow(true)),
  canBookmark: platformPermission("bookmarks:create"),
  canCensorComment: platformPermission("comments:censor"),
  canComment: platformPermission("comments:create"),
  canCreate: platformPermission("resources:create"),
  canLinkToVegetables: platformPermission("resources:revise"),
  canRemoveBookmark: (personId: PersonId) =>
    authenticatedPolicy((session) =>
      session.personId === personId
        ? allow(session)
        : deny("Must be the bookmark's owner to delete it"),
    ),
  canRevise: platformPermission("resources:revise"),
}
