import { allow, authenticatedPolicy, deny, platformPermission } from "../authorization/policy.js"
import { PersonId } from "../common/ids.js"

export const vegetablesPolicies = {
  canBookmark: platformPermission("bookmarks:create"),
  canCreate: platformPermission("vegetables:create"),
  canCreateVariety: platformPermission("vegetables:varieties:create"),
  canRemoveBookmark: (personId: PersonId) =>
    authenticatedPolicy((session) =>
      session.personId === personId
        ? allow(session)
        : deny("Must be the bookmark's owner to delete it"),
    ),
  canRevise: platformPermission("vegetables:revise"),
  canSetMainPhoto: platformPermission("vegetables:main-photo:set"),
}
