import {
  CrdtCommit,
  EventSourceData,
  IdGen,
  Locale,
  LoroDocFrontier,
  LoroDocSnapshot,
  type NoteSourceData,
  type PostClassification,
  PostCommitId,
  PostCommitRow,
  PostCrdtRow,
  PostId,
  PostRow,
  PostTagRow,
  PostTranslationRow,
  PostVegetableRow,
  ProfileId,
  QueriedPostData,
  TimestampColumn,
  tiptapToText,
} from "@gororobas/domain"
import { GetPostPageParams } from "@gororobas/domain/posts/api"
import { DateTime, Effect, Schema, ServiceMap } from "effect"
import { SqlClient, SqlSchema } from "effect/unstable/sql"

/**
 * Posts repository - minimal data access for posts.
 */
export class PostsRepository extends ServiceMap.Service<PostsRepository>()("PostsRepository", {
  make: Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient

    /**
     * ========================
     * QUERYING SPECIFIC TABLES
     * ========================
     **/
    const findPostRowById = SqlSchema.findOneOption({
      Request: PostId,
      Result: PostRow,
      execute: (id) => sql`SELECT * FROM posts WHERE id = ${id}`,
    })

    const findPostRowByHandle = SqlSchema.findOneOption({
      Request: Schema.String,
      Result: PostRow,
      execute: (handle) => sql`SELECT * FROM posts WHERE handle = ${handle}`,
    })

    const findPostTranslationRow = SqlSchema.findOneOption({
      Request: Schema.Struct({ postId: PostId, locale: Locale }),
      Result: PostTranslationRow,
      execute: ({ locale, postId }) =>
        sql`SELECT * FROM post_translations WHERE post_id = ${postId} AND locale = ${locale}`,
    })

    const listPostCommitRowsByPostId = SqlSchema.findAll({
      Request: PostId,
      Result: PostCommitRow,
      execute: (post_id) =>
        sql`SELECT * FROM post_commits WHERE post_id = ${post_id} ORDER BY created_at ASC`,
    })

    const findPostCrdtRowById = SqlSchema.findOneOption({
      Request: Schema.Struct({ id: PostId }),
      Result: PostCrdtRow,
      execute: ({ id }) => sql`SELECT * FROM post_crdts WHERE id = ${id}`,
    })

    /**
     * ============================
     * INSERTING TO SPECIFIC TABLES
     * ============================
     **/
    const insertPostCrdtRow = (input: {
      id: PostId
      loroCrdt: Uint8Array
      ownerProfileId: ProfileId
      createdAt: TimestampColumn
      updatedAt: TimestampColumn
    }) =>
      sql`INSERT INTO post_crdts (id, loro_crdt, owner_profile_id, created_at, updated_at) VALUES (${input.id}, ${input.loroCrdt}, ${input.ownerProfileId}, ${input.createdAt}, ${input.updatedAt})`

    type InsertCommitInput = Pick<PostCommitRow, "crdtUpdate" | "fromCrdtFrontier" | "postId"> & {
      commit: CrdtCommit
    }

    const insertPostCommitRow = SqlSchema.void({
      Request: PostCommitRow,
      execute: (row) => sql`INSERT INTO post_commits ${sql.insert(row)}`,
    })

    const insertPostCommit = (input: InsertCommitInput) =>
      Effect.gen(function* () {
        const id = yield* IdGen.make(PostCommitId)
        const now = yield* DateTime.now
        const createdById = input.commit._tag === "HumanCommit" ? input.commit.personId : null

        yield* insertPostCommitRow({
          id,
          postId: input.postId,
          createdById,
          crdtUpdate: input.crdtUpdate,
          fromCrdtFrontier: input.fromCrdtFrontier,
          createdAt: now,
          updatedAt: now,
        })
      })

    const upsertPostRow = SqlSchema.void({
      Request: PostRow,
      execute: (row) => sql`
        INSERT INTO posts (
          id,
          current_crdt_frontier,
          handle,
          visibility,
          published_at,
          created_at,
          updated_at,
          owner_profile_id,
          kind,
          start_date,
          end_date,
          location_or_url,
          attendance_mode
        ) VALUES (
          ${row.id},
          ${row.currentCrdtFrontier},
          ${row.handle},
          ${row.visibility},
          ${row.publishedAt},
          ${row.createdAt},
          ${row.updatedAt},
          ${row.ownerProfileId},
          ${row.kind},
          ${row.startDate},
          ${row.endDate},
          ${row.locationOrUrl},
          ${row.attendanceMode}
        )
        ON CONFLICT(id) DO UPDATE SET
          current_crdt_frontier = excluded.current_crdt_frontier,
          handle = excluded.handle,
          visibility = excluded.visibility,
          published_at = excluded.published_at,
          updated_at = excluded.updated_at,
          owner_profile_id = excluded.owner_profile_id,
          kind = excluded.kind,
          start_date = excluded.start_date,
          end_date = excluded.end_date,
          location_or_url = excluded.location_or_url,
          attendance_mode = excluded.attendance_mode
      `,
    })

    const insertPostTranslationRows = SqlSchema.void({
      Request: Schema.Array(PostTranslationRow),
      execute: (rows) => sql`INSERT INTO post_translations ${sql.insert(rows)}`,
    })

    const insertPostTagRows = SqlSchema.void({
      Request: Schema.Array(PostTagRow),
      execute: (rows) => sql`INSERT INTO post_tags ${sql.insert(rows)}`,
    })

    const insertPostVegetableRows = SqlSchema.void({
      Request: Schema.Array(PostVegetableRow),
      execute: (rows) => sql`INSERT INTO post_vegetables ${sql.insert(rows)}`,
    })

    /**
     * ===============
     * MATERIALIZATION
     * ===============
     **/

    const materializePostRow = Effect.fn("materializePostRow")(function* (data: {
      currentCrdtFrontier: LoroDocFrontier
      metadata: NoteSourceData["metadata"] | EventSourceData["metadata"]
      postId: PostId
    }) {
      const now = yield* DateTime.now
      const { metadata } = data

      if (metadata.kind === "EVENT") {
        return yield* upsertPostRow({
          ...metadata,
          createdAt: now,
          updatedAt: now,
          currentCrdtFrontier: data.currentCrdtFrontier,
          id: data.postId,
        })
      }

      return yield* upsertPostRow({
        ...metadata,
        createdAt: now,
        updatedAt: now,
        currentCrdtFrontier: data.currentCrdtFrontier,
        id: data.postId,
        attendanceMode: null,
        endDate: null,
        startDate: null,
        locationOrUrl: null,
      })
    })

    const materializeTranslations = (data: {
      locales: NoteSourceData["locales"] | EventSourceData["locales"]
      postId: PostId
    }) =>
      Effect.gen(function* () {
        const { locales, postId } = data

        yield* sql`DELETE FROM post_translations WHERE post_id = ${postId}`

        const translationRows = Object.entries(locales).flatMap(([locale, localeData]) => {
          if (!localeData || !Schema.is(Locale)(locale)) return []

          return PostTranslationRow.makeUnsafe({
            contentPlainText: tiptapToText(localeData.content),
            postId,
            locale: locale as Locale,
            content: localeData.content,
            originalLocale: localeData.originalLocale,
            translationSource: localeData.translationSource,
            translatedAtCrdtFrontier: localeData.translatedAtCrdtFrontier,
          })
        })

        if (translationRows.length === 0) return
        yield* insertPostTranslationRows(translationRows)
      })

    const materializeTags = (data: { classification: PostClassification | null; postId: PostId }) =>
      Effect.gen(function* () {
        const { classification, postId } = data

        yield* sql`DELETE FROM post_tags WHERE post_id = ${postId}`

        const postTagRows = (classification?.tags || []).flatMap((tag) => {
          if (tag._tag !== "ResolvedExistingTagExtraction") return []

          return PostTagRow.makeUnsafe({
            postId,
            tagId: tag.tagId,
            extractionText: tag.extractionText,
          })
        })

        if (postTagRows.length === 0) return
        yield* insertPostTagRows(postTagRows)
      })

    const materializeVegetables = (data: {
      classification: PostClassification | null
      postId: PostId
    }) =>
      Effect.gen(function* () {
        const { classification, postId } = data

        yield* sql`DELETE FROM post_vegetables WHERE post_id = ${postId}`

        const postVegetableRows =
          classification?.vegetables.flatMap((vegetable) => {
            if (vegetable._tag !== "ResolvedExistingVegetableExtraction") return []

            return PostVegetableRow.makeUnsafe({
              postId,
              vegetableId: vegetable.vegetableId,
              extractionText: vegetable.extractionText,
            })
          }) ?? []

        if (postVegetableRows.length === 0) return
        yield* insertPostVegetableRows(postVegetableRows)
      })

    const materialize = (data: {
      classification?: PostClassification | null
      currentCrdtFrontier: LoroDocFrontier
      locales: NoteSourceData["locales"] | EventSourceData["locales"]
      metadata: NoteSourceData["metadata"] | EventSourceData["metadata"]
      postId: PostId
    }) =>
      sql.withTransaction(
        Effect.gen(function* () {
          yield* materializePostRow(data)
          yield* materializeTranslations(data)
          yield* materializeTags({
            classification: data.classification ?? null,
            postId: data.postId,
          })
          yield* materializeVegetables({
            classification: data.classification ?? null,
            postId: data.postId,
          })
        }),
      )

    /**
     * ==========================
     * UPDATE & DELETE OPERATIONS
     * ==========================
     **/

    const updatePostCrdtRow = SqlSchema.void({
      Request: Schema.Struct({
        id: PostId,
        loroCrdt: LoroDocSnapshot,
        updatedAt: TimestampColumn,
      }),
      execute: (input) =>
        sql`UPDATE post_crdts SET loro_crdt = ${input.loroCrdt}, updated_at = ${input.updatedAt} WHERE id = ${input.id}`,
    })

    /** All other post-related tables cascade deletes as per `schema.sql` */
    const deletePost = SqlSchema.void({
      Request: PostId,
      execute: (postId) => sql`DELETE FROM post_crdts WHERE id = ${postId}`,
    })

    /**
     * =========================
     * QUERIES FOR THE FRONT-END
     * =========================
     **/

    const listPostCommitRowsByPostIdDesc = SqlSchema.findAll({
      Request: PostId,
      Result: PostCommitRow,
      execute: (postId) =>
        sql`SELECT * FROM post_commits WHERE post_id = ${postId} ORDER BY created_at DESC`,
    })

    const listPostContributorIdsByPostId = SqlSchema.findAll({
      Request: PostId,
      Result: Schema.Struct({ createdById: Schema.NullOr(ProfileId) }),
      execute: (postId) =>
        sql`SELECT DISTINCT created_by_id FROM post_commits WHERE post_id = ${postId} AND created_by_id IS NOT NULL`,
    })

    const listPostRowsByOwnerProfileId = SqlSchema.findAll({
      Request: ProfileId,
      Result: PostRow,
      execute: (ownerProfileId) =>
        sql`SELECT * FROM posts WHERE owner_profile_id = ${ownerProfileId} ORDER BY updated_at DESC`,
    })

    const countPostRowsByOwnerProfileId = SqlSchema.findOne({
      Request: ProfileId,
      Result: Schema.Struct({ count: Schema.Number }),
      execute: (ownerProfileId) =>
        sql`SELECT COUNT(*) as count FROM posts WHERE owner_profile_id = ${ownerProfileId}`,
    })

    const findPostPageData = SqlSchema.findOneOption({
      execute: (req) => sql`
        WITH
        -- Step 1: Find the target post by handle
        target_post AS (
            SELECT *
            FROM posts
            WHERE handle = ${req.handle}
            LIMIT 1
        ),
        -- Step 2: Select best translation based on locale preference
        best_translation AS (
            SELECT
                pt.post_id,
                pt.locale,
                pt.original_locale,
                pt.content,
                ROW_NUMBER() OVER (
                    ORDER BY
                        CASE pt.locale
                            WHEN ${req.locale} THEN 1  -- Requested locale
                            WHEN 'en' THEN 2           -- English fallback
                            WHEN 'pt' THEN 3           -- Portuguese fallback
                            WHEN 'es' THEN 4           -- Spanish fallback
                            ELSE 5                     -- Any other locale
                        END
                ) AS priority_rank
            FROM post_translations pt
            INNER JOIN target_post ON target_post.id = pt.post_id
        ),
        -- Step 3: Aggregate all tags for this post
        aggregated_tags AS (
            SELECT
                JSON_GROUP_ARRAY(
                    JSON_OBJECT(
                        'tag_id', pt.tag_id,
                        'extraction_text', pt.extraction_text
                    )
                ) AS tags
            FROM post_tags pt
            INNER JOIN target_post ON target_post.id = pt.post_id
        ),
        -- Step 4: Aggregate all vegetables for this post
        aggregated_vegetables AS (
            SELECT
                JSON_GROUP_ARRAY(
                    JSON_OBJECT(
                        'vegetable_id', pv.vegetable_id,
                        'extraction_text', pv.extraction_text
                    )
                ) AS vegetables
            FROM post_vegetables pv
            INNER JOIN target_post ON target_post.id = pv.post_id
        )
        -- Final: Combine all data
        SELECT
            -- Post core fields
            p.id,
            p.current_crdt_frontier,
            p.handle,
            p.visibility,
            p.published_at,
            p.updated_at,
            p.owner_profile_id,
            p.kind,
            -- Event-specific fields
            p.start_date,
            p.end_date,
            p.location_or_url,
            p.attendance_mode,
            -- Translation fields
            t.locale,
            t.original_locale,
            t.content,
            -- Aggregated relations
            tags.tags,
            vegs.vegetables
        FROM target_post p
        LEFT JOIN best_translation t ON t.priority_rank = 1
        LEFT JOIN aggregated_tags tags ON TRUE
        LEFT JOIN aggregated_vegetables vegs ON TRUE
        `,
      Request: GetPostPageParams,
      Result: QueriedPostData,
    })

    return {
      countPostRowsByOwnerProfileId,
      delete: deletePost,
      findPostCrdtRowById,
      findPostPageData,
      findPostRowByHandle,
      findPostRowById,
      findPostTranslationRow,
      insertPostCommit,
      insertPostCrdtRow,
      listPostCommitRowsByPostId,
      listPostCommitRowsByPostIdDesc,
      listPostContributorIdsByPostId,
      listPostRowsByOwnerProfileId,
      materialize,
      updatePostCrdtRow,
    } as const
  }),
}) {}
