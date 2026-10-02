import {
  Handle,
  ProfileContentCounts,
  ProfileId,
  ProfileMetadataResult,
  ProfileRow,
} from "@gororobas/domain"
import { Effect, Schema, SchemaGetter } from "effect"
import { SqlClient, SqlSchema } from "effect/unstable/sql"

export const findByHandle = SqlSchema.findOneOption({
  Request: Handle,
  Result: ProfileRow,
  execute: (handle) =>
    Effect.gen(function* () {
      const sql = yield* SqlClient.SqlClient
      return yield* sql`SELECT * FROM profiles WHERE handle = ${handle}`
    }),
})

export const findById = SqlSchema.findOneOption({
  Request: ProfileId,
  Result: ProfileRow,
  execute: (id) =>
    Effect.gen(function* () {
      const sql = yield* SqlClient.SqlClient
      return yield* sql`SELECT * FROM profiles WHERE id = ${id}`
    }),
})

export const isHandleInUse = SqlSchema.findOne({
  Request: Schema.String,
  Result: Schema.Struct({ result: Schema.BooleanFromBit }).pipe(
    Schema.decodeTo(Schema.Boolean, {
      decode: SchemaGetter.transform((row) => row.result),
      encode: SchemaGetter.transform((value) => ({ result: value })),
    }),
  ),
  execute: (handle) =>
    Effect.gen(function* () {
      const sql = yield* SqlClient.SqlClient
      return yield* sql`SELECT EXISTS(SELECT 1 FROM profiles WHERE handle = ${handle}) as result`
    }),
})

export const fetchProfileMetadata = SqlSchema.findOneOption({
  Request: Schema.String,
  Result: ProfileMetadataResult,
  execute: (handle) =>
    Effect.gen(function* () {
      const sql = yield* SqlClient.SqlClient
      return yield* sql`
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
    `
    }),
})

export const fetchProfileContentCounts = SqlSchema.findOne({
  Request: ProfileId,
  Result: ProfileContentCounts,
  execute: (id) =>
    Effect.gen(function* () {
      const sql = yield* SqlClient.SqlClient
      return yield* sql`
      SELECT
        (SELECT COUNT(*) FROM publications WHERE owner_profile_id = ${id} AND kind = 'POST') as posts,
        (SELECT COUNT(*) FROM publications WHERE owner_profile_id = ${id} AND kind = 'EVENT') as events,
        (SELECT COUNT(*) FROM bookmarks_wiki_articles WHERE person_id = ${id}) as wiki_article_bookmarks,
        (SELECT COUNT(*) FROM comments WHERE owner_profile_id = ${id}) as comments,
        (SELECT COUNT(*) FROM images WHERE owner_profile_id = ${id}) as images
    `
    }),
})
