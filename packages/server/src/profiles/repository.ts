import {
  Handle,
  ProfileContentCounts,
  ProfileId,
  ProfileMetadataResult,
  ProfileRow,
  ProfileRowUpdate,
  TimestampedStruct,
} from "@gororobas/domain"
import { Effect, Schema, SchemaGetter, Context } from "effect"
import { SqlClient, SqlSchema } from "effect/unstable/sql"

export class ProfilesRepository extends Context.Service<ProfilesRepository>()(
  "ProfilesRepository",
  {
    make: Effect.gen(function* () {
      const sql = yield* SqlClient.SqlClient

      const findByHandle = SqlSchema.findOneOption({
        Request: Handle,
        Result: ProfileRow,
        execute: (handle) => sql`SELECT * FROM profiles WHERE handle = ${handle}`,
      })

      const findById = SqlSchema.findOneOption({
        Request: ProfileId,
        Result: ProfileRow,
        execute: (id) => sql`SELECT * FROM profiles WHERE id = ${id}`,
      })

      const isHandleInUse = SqlSchema.findOne({
        Request: Schema.String,
        Result: Schema.Struct({ result: Schema.BooleanFromBit }).pipe(
          Schema.decodeTo(Schema.Boolean, {
            decode: SchemaGetter.transform((row) => row.result),
            encode: SchemaGetter.transform((val) => ({ result: val })),
          }),
        ),
        execute: (handle) => sql`
        SELECT EXISTS(SELECT 1 FROM profiles WHERE handle = ${handle}) as result
      `,
      })

      const updateProfileRow = SqlSchema.void({
        Request: ProfileRowUpdate.pipe(
          Schema.fieldsAssign({ id: ProfileId, updatedAt: TimestampedStruct.fields.updatedAt }),
        ),
        execute: ({ id, ...update }) =>
          sql`
          UPDATE profiles
          SET ${sql.update(update)}
          WHERE id = ${sql.safe(id)}
        `,
      })

      const insertProfile = SqlSchema.void({
        Request: ProfileRow,
        execute: (profile) => sql`
            INSERT INTO profiles ${sql.insert(profile)}
        `,
      })

      const fetchProfileMetadata = SqlSchema.findOneOption({
        Request: Schema.String,
        Result: ProfileMetadataResult,
        execute: (handle) => sql`
        SELECT
          p.id,
          p.type,
          p.handle,
          p.name,
          p.bio,
          p.location,
          p.photo_id as photoId,
          p.visibility,
          p.created_at as createdAt,
          p.updated_at as updatedAt,
          CASE
            WHEN p.type = 'ORGANIZATION' THEN json_object('id', o.id, 'type', o.type, 'membersVisibility', o.members_visibility)
            ELSE NULL
          END as organization
        FROM profiles p
        LEFT JOIN organizations o ON p.id = o.id
        WHERE p.handle = ${handle}
      `,
      })

      const fetchProfileNotes = (_handle: string) =>
        Effect.gen(function* () {
          yield* Effect.logDebug("fetchProfileNotes: stub")
          return []
        })

      const fetchProfileEvents = (_handle: string) =>
        Effect.gen(function* () {
          yield* Effect.logDebug("fetchProfileEvents: stub")
          return []
        })

      const fetchProfilePhotos = (_handle: string) =>
        Effect.gen(function* () {
          yield* Effect.logDebug("fetchProfilePhotos: stub")
          return []
        })

      const fetchProfileContributions = (_handle: string) =>
        Effect.gen(function* () {
          yield* Effect.logDebug("fetchProfileContributions: stub")
          return []
        })

      const fetchProfileWishlist = (_handle: string) =>
        Effect.gen(function* () {
          yield* Effect.logDebug("fetchProfileWishlist: stub")
          return []
        })

      const fetchProfileContentCounts = SqlSchema.findOne({
        Request: ProfileId,
        Result: ProfileContentCounts,
        execute: (id) => sql`
        SELECT
          (SELECT COUNT(*) FROM posts WHERE owner_profile_id = ${id} AND kind = 'note') as notes,
          (SELECT COUNT(*) FROM posts WHERE owner_profile_id = ${id} AND kind = 'event') as events,
          (SELECT COUNT(*) FROM bookmarks_vegetables WHERE person_id = ${id}) as vegetable_bookmarks,
          (SELECT COUNT(*) FROM bookmarks_resources WHERE person_id = ${id}) as resource_bookmarks,
          (SELECT COUNT(*) FROM comments WHERE owner_profile_id = ${id}) as comments,
          (SELECT COUNT(*) FROM images WHERE owner_profile_id = ${id}) as images
      `,
      })

      const deleteProfile = SqlSchema.void({
        Request: ProfileId,
        execute: (id) => sql`DELETE FROM profiles WHERE id = ${id}`,
      })

      return {
        delete: deleteProfile,
        fetchProfileContributions,
        fetchProfileContentCounts,
        fetchProfileEvents,
        fetchProfileMetadata,
        fetchProfileNotes,
        fetchProfilePhotos,
        fetchProfileWishlist,
        findByHandle,
        findById,
        insertProfile,
        isHandleInUse,
        updateProfileRow,
      } as const
    }),
  },
) {}
