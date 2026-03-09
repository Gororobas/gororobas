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
    const findById = SqlSchema.findOneOption({
      Request: PostId,
      Result: PostRow,
      execute: (id) => sql`SELECT * FROM posts WHERE id = ${id}`,
    })

    const findByHandle = SqlSchema.findOneOption({
      Request: Schema.String,
      Result: PostRow,
      execute: (handle) => sql`SELECT * FROM posts WHERE handle = ${handle}`,
    })

    const findTranslation = SqlSchema.findOneOption({
      Request: Schema.Struct({ postId: PostId, locale: Schema.String }),
      Result: PostTranslationRow,
      execute: ({ locale, postId }) =>
        sql`SELECT * FROM post_translations WHERE post_id = ${postId} AND locale = ${locale}`,
    })

    const findCommits = SqlSchema.findAll({
      Request: PostId,
      Result: PostCommitRow,
      execute: (post_id) =>
        sql`SELECT * FROM post_commits WHERE post_id = ${post_id} ORDER BY created_at ASC`,
    })

    const findCrdtById = SqlSchema.findOneOption({
      Request: Schema.Struct({ id: PostId }),
      Result: PostCrdtRow,
      execute: ({ id }) =>
        sql`SELECT id, loro_crdt, owner_profile_id, classification FROM post_crdts WHERE id = ${id}`,
    })

    /**
     * ============================
     * INSERTING TO SPECIFIC TABLES
     * ============================
     **/
    const insertCrdt = (input: {
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

    const insertCommitRow = SqlSchema.void({
      Request: PostCommitRow,
      execute: (row) => sql`INSERT INTO post_commits ${sql.insert(row)}`,
    })

    const insertCommit = (input: InsertCommitInput) =>
      Effect.gen(function* () {
        const id = yield* IdGen.make(PostCommitId)
        const now = yield* DateTime.now
        const createdById = input.commit._tag === "HumanCommit" ? input.commit.personId : null

        yield* insertCommitRow({
          id,
          postId: input.postId,
          createdById,
          crdtUpdate: input.crdtUpdate,
          fromCrdtFrontier: input.fromCrdtFrontier,
          createdAt: now,
          updatedAt: now,
        })
      })

    const upsertMain = SqlSchema.void({
      Request: PostRow,
      execute: (request) =>
        sql`INSERT INTO posts ${sql.insert(request)} ON CONFLICT(id) DO UPDATE SET ${sql.update}`,
    })

    const insertTranslations = SqlSchema.void({
      Request: Schema.Array(PostTranslationRow),
      execute: (rows) => sql`INSERT INTO post_translations ${sql.insert(rows)}`,
    })

    const insertTags = SqlSchema.void({
      Request: Schema.Array(PostTagRow),
      execute: (rows) => sql`INSERT INTO post_tags ${sql.insert(rows)}`,
    })

    const insertVegetables = SqlSchema.void({
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
      ownerProfileId: ProfileId
    }) {
      const now = yield* DateTime.now
      const { metadata } = data
      const isEvent = metadata.kind === "EVENT"
      const eventMeta = isEvent ? (metadata as EventSourceData["metadata"]) : null

      return yield* upsertMain({
        ...metadata,
        createdAt: now,
        updatedAt: now,
        currentCrdtFrontier: data.currentCrdtFrontier,
        id: data.postId,
        attendanceMode: eventMeta?.attendanceMode || null,
        endDate: eventMeta?.endDate || null,
        startDate: eventMeta?.startDate || null,
        locationOrUrl: eventMeta?.locationOrUrl || null,
      })
    })

    const materializeTranslations = (data: {
      currentCrdtFrontier: LoroDocFrontier
      locales: NoteSourceData["locales"] | EventSourceData["locales"]
      postId: PostId
    }) =>
      Effect.gen(function* () {
        const { locales, postId } = data

        yield* sql`DELETE FROM post_translations WHERE post_id = ${postId}`

        const translationsToInsert = Object.entries(locales).flatMap(([locale, localeData]) => {
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

        if (translationsToInsert.length === 0) return
        yield* insertTranslations(translationsToInsert)
      })

    const materializeTags = (data: { classification: PostClassification | null; postId: PostId }) =>
      Effect.gen(function* () {
        const { classification, postId } = data

        yield* sql`DELETE FROM post_tags WHERE post_id = ${postId}`

        if (!classification) return

        const existingTags = classification.tags.flatMap((t) =>
          t._tag === "ResolvedExistingTagExtraction"
            ? PostTagRow.makeUnsafe({
                postId,
                tagId: t.tagId,
                extractionText: t.extractionText,
              })
            : [],
        )

        if (existingTags.length === 0) return
        yield* insertTags(existingTags)
      })

    const materializeVegetables = (data: {
      classification: PostClassification | null
      postId: PostId
    }) =>
      Effect.gen(function* () {
        const { classification, postId } = data

        yield* sql`DELETE FROM post_vegetables WHERE post_id = ${postId}`

        if (!classification) return

        const existingVegetables = classification.vegetables.flatMap((veg) => {
          if (veg._tag !== "ResolvedExistingVegetableExtraction") return []

          return PostVegetableRow.makeUnsafe({
            postId,
            vegetableId: veg.vegetableId,
            extractionText: veg.extractionText,
          })
        })

        if (existingVegetables.length === 0) return
        yield* insertVegetables(existingVegetables)
      })

    const materialize = (data: {
      classification?: PostClassification | null
      currentCrdtFrontier: LoroDocFrontier
      locales: NoteSourceData["locales"] | EventSourceData["locales"]
      metadata: NoteSourceData["metadata"] | EventSourceData["metadata"]
      ownerProfileId: ProfileId
      postId: PostId
    }) =>
      sql.withTransaction(
        Effect.all(
          [
            materializePostRow(data),
            materializeTranslations(data),
            materializeTags({ classification: data.classification ?? null, postId: data.postId }),
            materializeVegetables({
              classification: data.classification ?? null,
              postId: data.postId,
            }),
          ],
          { concurrency: "unbounded" },
        ),
      )

    /**
     * ==========================
     * UPDATE & DELETE OPERATIONS
     * ==========================
     **/

    const updateCrdt = SqlSchema.void({
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

    const getCommitHistory = SqlSchema.findAll({
      Request: PostId,
      Result: PostCommitRow,
      execute: (postId) =>
        sql`SELECT * FROM post_commits WHERE post_id = ${postId} ORDER BY created_at DESC`,
    })

    const getContributors = SqlSchema.findAll({
      Request: PostId,
      Result: Schema.Struct({ createdById: Schema.NullOr(ProfileId) }),
      execute: (postId) =>
        sql`SELECT DISTINCT created_by_id FROM post_commits WHERE post_id = ${postId} AND created_by_id IS NOT NULL`,
    })

    const findByOwner = SqlSchema.findAll({
      Request: ProfileId,
      Result: PostRow,
      execute: (ownerProfileId) =>
        sql`SELECT * FROM posts WHERE owner_profile_id = ${ownerProfileId} ORDER BY updated_at DESC`,
    })

    const countByOwner = SqlSchema.findOne({
      Request: ProfileId,
      Result: Schema.Struct({ count: Schema.Number }),
      execute: (ownerProfileId) =>
        sql`SELECT COUNT(*) as count FROM posts WHERE owner_profile_id = ${ownerProfileId}`,
    })

    const getPageData = SqlSchema.findOneOption({
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
      countByOwner,
      delete: deletePost,
      findByHandle,
      findById,
      findByOwner,
      findCommits,
      findCrdtById,
      findTranslation,
      getCommitHistory,
      getContributors,
      getPageData,
      insertCommit,
      insertCrdt,
      materialize,
      updateCrdt,
    } as const
  }),
}) {}
