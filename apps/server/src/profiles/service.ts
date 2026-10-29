import {
  Handle,
  Policies,
  ProfileId,
  ProfileNotFoundError,
  ProfileRowUpdate,
  type ProfileRow,
} from "@gororobas/domain"
import { DateTime, Effect, Option, Context } from "effect"
import { SqlClient } from "effect/sql"

import { claimHandle } from "../common/handle-allocation.js"
import { ProfilesRepository } from "./repository.js"

/** @effect-expect-leaking SqlClient */
export class ProfileService extends Context.Service<ProfileService>()("ProfileService", {
  make: Effect.gen(function* () {
    const repo = yield* ProfilesRepository
    const sql = yield* SqlClient.SqlClient

    const authorizeRead = (profile: Option.Option<ProfileRow>) =>
      Option.match(profile, {
        onNone: () => Effect.void,
        onSome: Policies.profiles.canRead,
      })

    const findByHandle = (handle: Handle) =>
      repo.findByHandle(handle).pipe(Effect.tap(authorizeRead))

    const findById = (profileId: ProfileId) =>
      repo.findById(profileId).pipe(Effect.tap(authorizeRead))

    const updateProfile = (profileId: ProfileId, data: ProfileRowUpdate) =>
      Effect.gen(function* () {
        const profile = yield* repo.findById(profileId).pipe(
          Effect.flatMap(
            Option.match({
              onNone: () => Effect.fail(new ProfileNotFoundError({ id: profileId })),
              onSome: Effect.succeed,
            }),
          ),
        )

        yield* Policies.profiles.canEdit(profile)

        if (data.handle !== undefined) {
          yield* claimHandle({
            handle: data.handle,
            entity: "profile",
            // Keeping one's current handle isn't a conflict.
            isAvailable: (handle) =>
              handle === profile.handle
                ? Effect.succeed(true)
                : repo.isHandleInUse(handle).pipe(Effect.map((inUse) => !inUse)),
          })
        }

        return yield* repo.updateProfileRow({
          id: profileId,
          ...data,
          updatedAt: yield* DateTime.now,
        })
      }).pipe(sql.withTransaction)

    return {
      findByHandle,
      findById,
      updateProfile,
    } as const
  }),
}) {}
