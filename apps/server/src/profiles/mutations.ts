import {
  MediaAssetId,
  ProfileId,
  ProfileRow,
  ProfileRowUpdate,
  profileSearchableText,
  TimestampedStruct,
} from "@gororobas/domain"
import { Effect, Schema } from "effect"
import { SqlClient, SqlSchema } from "effect/sql"

import { deleteAuthSubject } from "../authentication/delete-auth-subject.js"

const SearchableProfileFields = Schema.Struct({
  name: Schema.String,
  handle: Schema.String,
  location: Schema.NullOr(Schema.String),
})

const findSearchableProfileFields = SqlSchema.findOne({
  Request: ProfileId,
  Result: SearchableProfileFields,
  execute: (id) =>
    SqlClient.SqlClient.use(
      (sql) => sql`SELECT name, handle, location FROM profiles WHERE id = ${id}`,
    ),
})

export const updateProfileRow = SqlSchema.void({
  Request: ProfileRowUpdate.pipe(
    Schema.fieldsAssign({ id: ProfileId, updatedAt: TimestampedStruct.fields.updatedAt }),
  ),
  execute: ({ id, ...update }) =>
    SqlClient.SqlClient.use((sql) =>
      Effect.gen(function* () {
        yield* sql`UPDATE profiles SET ${sql.update(update)} WHERE id = ${id}`
        if (!("name" in update || "handle" in update || "location" in update)) return

        const searchableText = profileSearchableText(
          yield* findSearchableProfileFields(ProfileId.make(id)),
        )
        yield* sql`UPDATE profiles SET ${sql.update({ searchableText })} WHERE id = ${id}`
      }).pipe(sql.withTransaction),
    ),
})

export const insertProfile = SqlSchema.void({
  Request: ProfileRow,
  execute: (profile) =>
    SqlClient.SqlClient.use(
      (sql) =>
        sql`INSERT INTO profiles ${sql.insert({ ...profile, searchableText: profileSearchableText(profile) })}`,
    ),
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
