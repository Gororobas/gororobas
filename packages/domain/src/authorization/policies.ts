import { mediaPolicies } from "../media-assets/policies.js"
import { organizationsPolicies } from "../organizations/policies.js"
import { peoplePolicies } from "../people/policies.js"
import { profilePolicies } from "../profiles/policies.js"
import { publicationCommentsPolicies } from "../publication-comments/policies.js"
import { publicationsPolicies } from "../publications/policies.js"
import { wikiPolicies } from "../wiki/policies.js"
import {
  assertAuthenticated,
  assertNonBlockedPerson,
  assertTrustedPerson,
  check,
  platformPermission,
} from "./policy.js"

const Policies = {
  helpers: { check },
  common: { assertTrustedPerson, assertAuthenticated, assertNonBlockedPerson },

  // Cross-cutting
  revisions: {
    canEvaluate: platformPermission("revisions:evaluate"),
  },

  // Domain-specific
  publicationComments: publicationCommentsPolicies,
  media: mediaPolicies,
  organizations: organizationsPolicies,
  people: peoplePolicies,
  publications: publicationsPolicies,
  wiki: wikiPolicies,
  profiles: profilePolicies,
}

export default Policies
