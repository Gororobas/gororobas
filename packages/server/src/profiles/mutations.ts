import { ProfileId, ProfileRow, ProfileRowUpdate, TimestampedStruct } from "@gororobas/domain"
import { Effect, Schema } from "effect"
import { SqlClient, SqlSchema } from "effect/unstable/sql"

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

export const deleteProfile = SqlSchema.void({
  Request: ProfileId,
  execute: (id) =>
    Effect.gen(function* () {
      const sql = yield* SqlClient.SqlClient
      return yield* sql`DELETE FROM profiles WHERE id = ${id}`
    }),
})
