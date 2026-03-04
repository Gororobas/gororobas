import { platformPermission } from "../authorization/policy.js"

export const commentsPolicies = {
  canCensor: platformPermission("comments:censor"),
  canCreate: platformPermission("comments:create"),
}
