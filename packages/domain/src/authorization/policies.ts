import { commentsPolicies } from "../comments/policies.js"
import { mediaPolicies } from "../media/policies.js"
import { organizationsPolicies } from "../organizations/policies.js"
import { peoplePolicies } from "../people/policies.js"
import { profilePolicies } from "../profiles/policies.js"
import { publicationsPolicies } from "../publications/policies.js"
import { resourcesPolicies } from "../resources/policies.js"
import { vegetablesPolicies } from "../vegetables/policies.js"
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
  comments: commentsPolicies,
  media: mediaPolicies,
  organizations: organizationsPolicies,
  people: peoplePolicies,
  publications: publicationsPolicies,
  resources: resourcesPolicies,
  vegetables: vegetablesPolicies,
  wiki: wikiPolicies,
  profiles: profilePolicies,
}

export default Policies
