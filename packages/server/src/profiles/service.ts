import { ProfileId, ProfileRowUpdate } from "@gororobas/domain"
import { HandleTakenError } from "@gororobas/domain/common/errors"
import { DateTime, Effect, ServiceMap } from "effect"
import { SqlClient } from "effect/unstable/sql"

import { ProfilesRepository } from "./repository.js"

export class ProfileService extends ServiceMap.Service<ProfileService>()("ProfileService", {
  make: Effect.gen(function* () {
    const repo = yield* ProfilesRepository
    const sql = yield* SqlClient.SqlClient

    const updateProfile = (profileId: ProfileId, data: ProfileRowUpdate) =>
      Effect.gen(function* () {
        if (data.handle !== undefined) {
          const inUse = yield* repo.isHandleInUse(data.handle)
          if (inUse) {
            return yield* new HandleTakenError({ handle: data.handle, entity: "profile" })
          }
        }

        return yield* repo.updateProfileRow({
          id: profileId,
          ...data,
          updatedAt: yield* DateTime.now,
        })
      }).pipe(sql.withTransaction)

    return {
      updateProfile,
    } as const
  }),
}) {}
