import { allow, authenticatedPolicy, deny, platformPermission } from "../authorization/policy.js"
import { PersonId } from "../common/ids.js"

export const wikiPolicies = {
  canBookmark: platformPermission("bookmarks:create"),
  canCreate: platformPermission("wiki-article:create"),
  canRemoveBookmark: (personId: PersonId) =>
    authenticatedPolicy((session) =>
      session.personId === personId
        ? allow(session)
        : deny("Must be the bookmark's owner to delete it"),
    ),
  canRevise: platformPermission("wiki-article:revise"),
}
