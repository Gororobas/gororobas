import {
  Handle,
  ProfileContentCounts,
  ProfileId,
  ProfileMetadataResult,
  ProfileRow,
  ProfileSearchParams,
  ProfileCardData,
} from "@gororobas/domain"
import { Array as EffectArray, Effect, Option, Schema, SchemaGetter } from "effect"
import { SqlClient, SqlSchema } from "effect/sql"
import type { Statement } from "effect/sql"

import {
  containsEveryTerm,
  fullTextQuery,
  rankBySimilarity,
  SIMILARITY_CANDIDATES,
  similarityQuery,
} from "../db/full-text-search.js"

/** Text searches rank by relevance, then alphabetically. */
export const searchProfiles = SqlSchema.findAll({
  Request: ProfileSearchParams,
  Result: ProfileCardData,
  execute: (query) =>
    SqlClient.SqlClient.use((sql) => {
      /** Text searches join their ranking, and order by it before the name. */
      const select = (ranking: Statement.Fragment, orderBy: Statement.Fragment) => sql`
        SELECT p.id, p.type, p.handle, p.name, p.location, m.id AS photo_id
        FROM profiles p
        ${ranking}
        LEFT JOIN media_assets m ON m.id = p.photo_id AND m.moderation_status <> 'CENSORED'
        WHERE p.visibility = 'PUBLIC'
          AND NOT EXISTS (SELECT 1 FROM auth_subjects a WHERE a.id = p.id AND a.active = 0)
          ${query.type === undefined ? sql`` : sql`AND p.type = ${query.type}`}
        ORDER BY ${orderBy} p.name COLLATE NOCASE, p.handle, p.id
        LIMIT 100
      `

      if (query.text === undefined) return select(sql``, sql``)

      const text = query.text

      const matching = Option.match(fullTextQuery(sql, text), {
        onNone: () => Effect.succeed([]),
        onSome: (textQuery) => sql`
          WITH matches AS (
            SELECT id, searchable_text, fts_score(searchable_text, ${textQuery}) AS score
            FROM profiles
            WHERE fts_match(searchable_text, ${textQuery})
          )
          ${select(
            sql`JOIN matches ON matches.id = p.id AND ${containsEveryTerm(sql, {
              searchable: sql`matches.searchable_text`,
              text,
            })}`,
            sql`matches.score DESC,`,
          )}
        `,
      })

      // Nothing matches a misspelled name, so look for names within a few edits of it.
      const similar = Effect.gen(function* () {
        const candidates = yield* findNameCandidates(text)

        const ids = rankBySimilarity({
          text,
          candidates,
          words: (candidate) => candidate.searchableText,
        }).map(({ id }) => id)

        if (EffectArray.isReadonlyArrayEmpty(ids)) return []

        return yield* select(
          sql`JOIN json_each(${encodeIds(ids)}) ranked ON ranked.value = p.id`,
          sql`ranked.key,`,
        )
      })

      return Effect.flatMap(matching, (rows) =>
        EffectArray.isReadonlyArrayEmpty(rows) ? similar : Effect.succeed(rows),
      )
    }),
})

const encodeIds = Schema.encodeSync(Schema.fromJsonString(Schema.Array(ProfileId)))

/** Profiles sharing trigrams with a search, best first, to compare their names with it. */
const findNameCandidates = SqlSchema.findAll({
  Request: Schema.String,
  Result: Schema.Struct({ id: ProfileId, searchableText: Schema.String }),
  execute: (text) =>
    SqlClient.SqlClient.use((sql) =>
      Option.match(similarityQuery(sql, text), {
        onNone: () => Effect.succeed([]),
        onSome: (query) => sql`
          WITH matches AS (
            SELECT id, searchable_text, fts_score(searchable_text, ${query}) AS score
            FROM profiles
            WHERE fts_match(searchable_text, ${query})
          )
          SELECT id, searchable_text FROM matches
          ORDER BY score DESC LIMIT ${sql.literal(String(SIMILARITY_CANDIDATES))}
        `,
      }),
    ),
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
