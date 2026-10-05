import { platformPermission } from "../authorization/policy.js"

export const mediaPolicies = {
  canAttachToWikiArticle: platformPermission("wiki-article:revise"),
  canCensor: platformPermission("media:censor"),
  canCreate: platformPermission("media:create"),
}
