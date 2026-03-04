import { platformPermission } from "../authorization/policy.js"

export const mediaPolicies = {
  canAttachToVegetable: platformPermission("vegetables:revise"),
  canCensor: platformPermission("media:censor"),
  canCreate: platformPermission("media:create"),
}
