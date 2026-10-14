import {
  Handle,
  ProfileContentCounts,
  ProfileId,
  ProfileMetadataResult,
  ProfileRow,
  ProfileSearchParams,
  ProfileCardData,
} from "@gororobas/domain"
import { Effect, Schema, SchemaGetter } from "effect"
import { SqlClient, SqlSchema } from "effect/sql"

export const searchProfiles = SqlSchema.findAll({
  Request: ProfileSearchParams,
  Result: ProfileCardData,
  execute: (query) =>
    Effect.gen(function* () {
      const sql = yield* SqlClient.SqlClient
      const text = query.text?.toLowerCase()

      return yield* sql`
        SELECT p.id, p.type, p.handle, p.name, p.location, m.id AS photo_id
        FROM profiles p
        LEFT JOIN media_assets m ON m.id = p.photo_id AND m.moderation_status <> 'CENSORED'
        WHERE p.visibility = 'PUBLIC'
          AND NOT EXISTS (SELECT 1 FROM auth_subjects a WHERE a.id = p.id AND a.active = 0)
          ${query.type === undefined ? sql`` : sql`AND p.type = ${query.type}`}
          ${text === undefined ? sql`` : sql`AND (instr(lower(p.name), ${text}) > 0 OR instr(p.handle, ${text}) > 0 OR instr(lower(coalesce(p.location, '')), ${text}) > 0)`}
        ORDER BY p.name COLLATE NOCASE, p.handle, p.id
        LIMIT 100
      `
    }),
})

export const findByHandle = SqlSchema.findOneOption({
  Request: Handle,
  Result: ProfileRow,
  execute: (handle) =>
    Effect.gen(function* () {
      const sql = yield* SqlClient.SqlClient
      return yield* sql`SELECT p.* FROM profiles p WHERE handle = ${handle} AND NOT EXISTS (SELECT 1 FROM auth_subjects a WHERE a.id = p.id AND a.active = 0)`
    }),
})

export const findById = SqlSchema.findOneOption({
  Request: ProfileId,
  Result: ProfileRow,
  execute: (id) =>
    Effect.gen(function* () {
      const sql = yield* SqlClient.SqlClient
      return yield* sql`SELECT p.* FROM profiles p WHERE id = ${id} AND NOT EXISTS (SELECT 1 FROM auth_subjects a WHERE a.id = p.id AND a.active = 0)`
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
        AND NOT EXISTS (SELECT 1 FROM auth_subjects a WHERE a.id = p.id AND a.active = 0)
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
        (SELECT COUNT(*) FROM publication_comments WHERE owner_profile_id = ${id}) as publication_comments,
        (SELECT COUNT(*) FROM media_assets WHERE format = 'IMAGE' AND owner_profile_id = ${id}) as images
    `
    }),
})
