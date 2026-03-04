import { commentsPolicies } from "../comments/policies.js"
import { mediaPolicies } from "../media/policies.js"
import { organizationsPolicies } from "../organizations/policies.js"
import { peoplePolicies } from "../people/policies.js"
import { postsPolicies } from "../posts/policies.js"
import { profilePolicies } from "../profiles/policies.js"
import { resourcesPolicies } from "../resources/policies.js"
import { vegetablesPolicies } from "../vegetables/policies.js"
import { assertAuthenticated, assertTrustedPerson, check, platformPermission } from "./policy.js"

const Policies = {
  helpers: { check },
  common: { assertTrustedPerson, assertAuthenticated },

  // Cross-cutting
  revisions: {
    canEvaluate: platformPermission("revisions:evaluate"),
  },

  // Domain-specific
  comments: commentsPolicies,
  media: mediaPolicies,
  organizations: organizationsPolicies,
  people: peoplePolicies,
  posts: postsPolicies,
  resources: resourcesPolicies,
  vegetables: vegetablesPolicies,
  profiles: profilePolicies,
}

export default Policies
