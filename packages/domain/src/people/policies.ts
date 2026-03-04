import { platformPermission } from "../authorization/policy.js"
import type { PlatformAccessLevel } from "../common/enums.js"

export const peoplePolicies = {
  canModifyAccessLevel: ({ from, to }: { from: PlatformAccessLevel; to: PlatformAccessLevel }) => {
    if (to === "MODERATOR" || from === "MODERATOR") {
      return platformPermission("people:manage-moderators")
    }

    if (to === "ADMIN" || from === "ADMIN") {
      return platformPermission("people:manage-admins")
    }

    return platformPermission("people:manage-trusted")
  },
}
