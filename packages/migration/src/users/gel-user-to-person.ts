import { PlatformAccessLevel } from "@gororobas/domain"

import { GelUserWithProfile, UserDataForMigration } from "../schemas/gel/entities.js"
import { type GelRole } from "../schemas/gel/enums.js"

const roleMap: Record<GelRole, PlatformAccessLevel> = {
  ADMIN: "ADMIN",
  MODERATOR: "MODERATOR",
  USER: "COMMUNITY",
}

export const gelUserToPersonData = (source: GelUserWithProfile) => {
  const name = source.profile.name.trim()
  const location = source.profile.location?.trim() || null

  return UserDataForMigration.makeEffect({
    latest_source: source,
    account: {
      name,
      email: source.email,
      is_email_verified: source.is_email_verified,
      image: null,
      created_at: source.created,
      updated_at: source.updated,
    },
    profile: {
      type: "PERSON",
      handle: source.profile.handle,
      name,
      bio: source.profile.bio ?? null,
      location,
      photo_gel_id: source.profile.photo?.id ?? null,
      visibility: "PUBLIC",
      created_at: source.created,
      updated_at: source.updated,
    },
    person: {
      access_level: roleMap[source.userRole ?? "USER"],
      access_set_by_gel_id: null,
      access_set_at: null,
    },
  })
}
