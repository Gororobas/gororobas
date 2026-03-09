import { deny, platformPermission, policy } from "../authorization/policy.js"
import type { PlatformAccessLevel } from "../common/enums.js"

export const peoplePolicies = {
  canModifyAccessLevel: ({ from, to }: { from: PlatformAccessLevel; to: PlatformAccessLevel }) => {
    if (to === "NEWCOMER") return policy(() => deny("Can't rollback a person to being a newcomer"))

    if (to === "ADMIN" || from === "ADMIN") {
      return platformPermission("people:manage-admins")
    }

    if (to === "MODERATOR" || from === "MODERATOR") {
      return platformPermission("people:manage-moderators")
    }

    return platformPermission("people:manage-community-access")
  },
}
