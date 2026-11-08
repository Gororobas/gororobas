import {
  BookmarkState,
  Handle,
  IntNonNegative,
  MediaAssetId,
  MediaAssetRow,
  type Session,
  TimestampColumn,
  WikiArticleId,
  WikiArticleKind,
  PROFILE_COLLECTION_PAGE_SIZE,
  ProfileId,
  PublicationCommentId,
  PublicationId,
  ProfileMetadataResult,
  ProfileRow,
  ProfileSearchParams,
  ProfileCardData,
  ProfileLocationCardData,
  SupportedLanguage,
} from "@gororobas/domain"
import { Array as EffectArray, Effect, Option, Schema, SchemaGetter } from "effect"
import { SqlClient, SqlSchema } from "effect/sql"
import type { Statement } from "effect/sql"

import { publicationVisibleTo } from "../content-visibility/visible-to.js"
import {
  containsEveryTerm,
  fullTextQuery,
  rankBySimilarity,
  SIMILARITY_CANDIDATES,
  similarityQuery,
} from "../db/full-text-search.js"
import { latestPublicProfileLocationJson } from "./location-sql.js"

const ProfileCardRow = Schema.Struct({
  ...ProfileCardData.fields,
  location: Schema.NullOr(Schema.fromJsonString(ProfileLocationCardData)),
})

/** Text searches rank by relevance, then alphabetically. Places are named in `language`. */
export const searchProfiles = SqlSchema.findAll({
  Request: Schema.Struct({ ...ProfileSearchParams.fields, language: SupportedLanguage }),
  Result: ProfileCardRow,
  execute: (query) =>
    SqlClient.SqlClient.use((sql) => {
      /** Text searches join their ranking, and order by it before the name. */
      const select = (ranking: Statement.Fragment, orderBy: Statement.Fragment) => sql`
        SELECT p.id, p.type, p.handle, p.name, m.id AS photo_id,
          ${latestPublicProfileLocationJson(sql, { profileIdColumn: "p.id", language: query.language })} AS location
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

      return Effect.filterOrElse(
        matching,
        (rows) => !EffectArray.isReadonlyArrayEmpty(rows),
        (_rows) => similar,
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

const IdsJson = <S extends Schema.Top>(id: S) => Schema.fromJsonString(Schema.Array(id))

export const fetchProfileContent = SqlSchema.findOne({
  Request: ProfileId,
  Result: Schema.Struct({
    postIds: IdsJson(PublicationId),
    eventIds: IdsJson(PublicationId),
    wikiArticleBookmarkIds: IdsJson(WikiArticleId),
    publicationCommentIds: IdsJson(PublicationCommentId),
    imageIds: IdsJson(MediaAssetId),
  }),
  execute: (id) =>
    Effect.gen(function* () {
      const sql = yield* SqlClient.SqlClient

      return yield* sql`
      SELECT
        (SELECT json_group_array(s.id) FROM publication_sources s JOIN publication_projections p ON p.id = s.id
          WHERE s.owner_profile_id = ${id} AND p.kind = 'POST') as post_ids,
        (SELECT json_group_array(s.id) FROM publication_sources s JOIN publication_projections p ON p.id = s.id
          WHERE s.owner_profile_id = ${id} AND p.kind = 'EVENT') as event_ids,
        (SELECT json_group_array(wiki_article_id) FROM bookmarks_wiki_articles WHERE person_id = ${id}) as wiki_article_bookmark_ids,
        (SELECT json_group_array(id) FROM publication_comments WHERE owner_profile_id = ${id}) as publication_comment_ids,
        (SELECT json_group_array(id) FROM media_assets WHERE format = 'IMAGE' AND owner_profile_id = ${id}) as image_ids
    `
    }),
})

/** The profile's latest location, as its page shows it: only when that entry is public. */
export const findPageLocation = SqlSchema.findOne({
  Request: Schema.Struct({ profileId: ProfileId, language: SupportedLanguage }),
  Result: Schema.Struct({
    location: Schema.NullOr(Schema.fromJsonString(ProfileLocationCardData)),
  }),
  execute: ({ profileId, language }) =>
    SqlClient.SqlClient.use(
      (sql) => sql`
        SELECT ${latestPublicProfileLocationJson(sql, { profileIdColumn: "p.id", language })} AS location
        FROM profiles p WHERE p.id = ${profileId}
      `,
    ),
})

/** Published articles the profile bookmarked, as anything but indifferent. */
/** One page of a profile's collection, as LIMIT and OFFSET. */
const pageOf = (sql: SqlClient.SqlClient, currentPage: number) =>
  sql`LIMIT ${PROFILE_COLLECTION_PAGE_SIZE} OFFSET ${currentPage * PROFILE_COLLECTION_PAGE_SIZE}`

/** Bookmarked articles' projections, under the `a` alias, only while they're published. */
const publishedArticleJoin = (sql: SqlClient.SqlClient) => sql`
  JOIN wiki_article_projections a ON a.id = b.wiki_article_id
  JOIN wiki_article_sources source ON source.id = a.id AND source.status = 'PUBLISHED'`

/** Published articles the profile saved, optionally of one kind or in one state. */
export const listBookmarkedArticles = SqlSchema.findAll({
  Request: Schema.Struct({
    profileId: ProfileId,
    currentPage: IntNonNegative,
    kind: Schema.optionalKey(WikiArticleKind),
    state: Schema.optionalKey(BookmarkState),
  }),
  Result: Schema.Struct({ wikiArticleId: WikiArticleId, state: BookmarkState }),
  execute: ({ profileId, currentPage, kind, state }) =>
    SqlClient.SqlClient.use(
      (sql) => sql`
        SELECT b.wiki_article_id, b.state FROM bookmarks_wiki_articles b
        ${publishedArticleJoin(sql)}
        WHERE b.person_id = ${profileId} AND b.state <> 'INDIFFERENT'
          ${kind === undefined ? sql`` : sql`AND a.kind = ${kind}`}
          ${state === undefined ? sql`` : sql`AND b.state = ${state}`}
        ORDER BY b.wiki_article_id
        ${pageOf(sql, currentPage)}
      `,
    ),
})

/** The kinds of published article the profile saved, so filters only offer those it has. */
export const listBookmarkedKinds = SqlSchema.findAll({
  Request: ProfileId,
  Result: Schema.Struct({ kind: WikiArticleKind }),
  execute: (profileId) =>
    SqlClient.SqlClient.use(
      (sql) => sql`
        SELECT DISTINCT a.kind FROM bookmarks_wiki_articles b
        ${publishedArticleJoin(sql)}
        WHERE b.person_id = ${profileId} AND b.state <> 'INDIFFERENT'
        ORDER BY a.kind
      `,
    ),
})

/** Articles with revisions the profile created that were approved, most recent first. */
export const listContributedArticles = SqlSchema.findAll({
  Request: Schema.Struct({ profileId: ProfileId, currentPage: IntNonNegative }),
  Result: Schema.Struct({
    wikiArticleId: WikiArticleId,
    revisionCount: IntNonNegative,
    lastContributedAt: TimestampColumn,
  }),
  execute: ({ profileId, currentPage }) =>
    SqlClient.SqlClient.use(
      (sql) => sql`
        SELECT r.wiki_article_id, COUNT(*) AS revision_count, MAX(r.created_at) AS last_contributed_at
        FROM wiki_article_revisions r
        WHERE r.created_by_id = ${profileId} AND r.evaluation = 'APPROVED'
        GROUP BY r.wiki_article_id
        ORDER BY last_contributed_at DESC, r.wiki_article_id
        ${pageOf(sql, currentPage)}
      `,
    ),
})

/**
 * Images credited to the profile, as the person who took them, that `session` can see: censored
 * ones only by their owner, and each attached to a wiki article, which anyone can read, or to a
 * publication `session` can see. What the profile uploaded of others' shows in its contributions.
 */
export const listVisiblePhotos = (session: Session) =>
  SqlSchema.findAll({
    Request: Schema.Struct({ profileId: ProfileId, currentPage: IntNonNegative }),
    Result: MediaAssetRow,
    execute: ({ profileId, currentPage }) =>
      SqlClient.SqlClient.use(
        (sql) => sql`
          SELECT m.* FROM media_assets m
          WHERE m.format = 'IMAGE'
            AND EXISTS (
              SELECT 1 FROM media_asset_credits credit
              WHERE credit.media_asset_id = m.id AND credit.person_id = ${profileId}
            )
            AND (m.moderation_status <> 'CENSORED'
              OR ${session.type === "ACCOUNT" ? sql`m.owner_profile_id = ${session.personId}` : sql.literal("0")})
            AND (
              EXISTS (SELECT 1 FROM wiki_article_media_assets w WHERE w.media_asset_id = m.id)
              OR EXISTS (
                SELECT 1 FROM publication_media_assets attached
                JOIN publication_sources source ON source.id = attached.publication_id
                WHERE attached.media_asset_id = m.id AND ${publicationVisibleTo(sql, session)}
              )
            )
          ORDER BY m.created_at DESC, m.id
          ${pageOf(sql, currentPage)}
        `,
      ),
  })
