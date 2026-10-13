import {
  MediaAssetId,
  ProfileId,
  ProfileRow,
  ProfileRowUpdate,
  TimestampedStruct,
} from "@gororobas/domain"
import { Effect, Schema } from "effect"
import { SqlClient, SqlSchema } from "effect/sql"

import { deleteAuthSubject } from "../authentication/delete-auth-subject.js"

export const updateProfileRow = SqlSchema.void({
  Request: ProfileRowUpdate.pipe(
    Schema.fieldsAssign({ id: ProfileId, updatedAt: TimestampedStruct.fields.updatedAt }),
  ),
  execute: ({ id, ...update }) =>
    Effect.gen(function* () {
      const sql = yield* SqlClient.SqlClient
      return yield* sql`UPDATE profiles SET ${sql.update(update)} WHERE id = ${id}`
    }),
})

export const insertProfile = SqlSchema.void({
  Request: ProfileRow,
  execute: (profile) =>
    Effect.gen(function* () {
      const sql = yield* SqlClient.SqlClient
      return yield* sql`INSERT INTO profiles ${sql.insert(profile)}`
    }),
})

export const deleteProfileReturningMediaAssets = SqlSchema.findAll({
  Request: ProfileId,
  Result: Schema.Struct({ mediaAssetId: MediaAssetId }),
  execute: (id) =>
    SqlClient.SqlClient.use((sql) =>
      Effect.gen(function* () {
        const media =
          yield* sql`SELECT id AS media_asset_id FROM media_assets WHERE owner_profile_id = ${id}`
        yield* deleteAuthSubject(ProfileId.make(id))
        yield* sql`DELETE FROM profiles WHERE id = ${id}`
        return media
      }).pipe(sql.withTransaction),
    ),
})
