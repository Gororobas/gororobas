import {
  CrdtCommit,
  EventSourceData,
  IdGen,
  LoroDocFrontier,
  type NoteSourceData,
  PostCommitId,
  PostCommitRow,
  PostCrdtRow,
  PostId,
  PostNotFoundError,
  PostRow,
  PostTranslationRow,
  ProfileId,
  QueriedPostData,
  TagId,
  TimestampColumn,
  VegetableId,
} from "@gororobas/domain"
import { GetPostPageParams } from "@gororobas/domain/posts/api"
import { Data, DateTime, Effect, Option, Schema, ServiceMap } from "effect"
/**
 * Posts repository - minimal data access for posts.
 */
import { SqlClient, SqlSchema } from "effect/unstable/sql"

import { type PostClassification } from "../classification/domain.js"

export class PostRepositoryError extends Data.TaggedError("PostRepositoryError")<{
  reason: "NOT_FOUND" | "INVALID_CRDT" | "VALIDATION_FAILED"
  message?: string
  context?: Record<string, unknown>
}> {}

export class PostsRepository extends ServiceMap.Service<PostsRepository>()("PostsRepository", {
  make: Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient

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

    const getPageData = SqlSchema.findOneOption({
      execute: (req) => sql`
        WITH
        p AS (
          SELECT *
          FROM posts
          WHERE handle = ${req.handle}
          LIMIT 1
        ),
        preferred_translation AS (
          SELECT
            pt.post_id,
            pt.locale,
            pt.original_locale,
            pt.content,
            ROW_NUMBER() OVER (
              ORDER BY
                CASE pt.locale
                  WHEN ${req.locale} THEN 1
                  WHEN 'en' THEN 2
                  WHEN 'pt' THEN 3
                  WHEN 'es' THEN 4
                  ELSE 5
                END
            ) AS rn
          FROM post_translations pt
          INNER JOIN p ON p.id = pt.post_id
        ),
        matched_tags AS (
          SELECT
            JSON_GROUP_ARRAY(
              JSON_OBJECT(
                'tag_id', ptags.tag_id,
                'extraction_text', ptags.extraction_text
              )
            ) AS tags
          FROM post_tags ptags
          INNER JOIN p ON p.id = ptags.post_id
        ),
        matched_vegetables AS (
          SELECT
            JSON_GROUP_ARRAY(
              JSON_OBJECT(
                'vegetable_id', pvegs.vegetable_id,
                'extraction_text', pvegs.extraction_text
              )
            ) AS vegetables
          FROM post_vegetables pvegs
          INNER JOIN p ON p.id = pvegs.post_id
        )
        SELECT
          p.id,
          p.current_crdt_frontier,
          p.handle,
          p.visibility,
          p.published_at,
          p.updated_at,
          p.owner_profile_id,
          p.kind,
          p.start_date,
          p.end_date,
          p.location_or_url,
          p.attendance_mode,
          t.locale AS locale,
          t.original_locale AS original_locale,
          t.content AS content,
          mt.tags,
          mv.vegetables
        FROM p
        LEFT JOIN preferred_translation t ON t.rn = 1
        LEFT JOIN matched_tags mt ON TRUE
        LEFT JOIN matched_vegetables mv ON TRUE
      `,
      Request: GetPostPageParams,
      Result: QueriedPostData,
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

    const fetchCrdt = SqlSchema.findOneOption({
      Request: Schema.Struct({ id: PostId }),
      Result: PostCrdtRow,
      execute: ({ id }) =>
        sql`SELECT id, loro_crdt, owner_profile_id, classification FROM post_crdts WHERE id = ${id}`,
    })

    const getCrdt = (id: PostId) =>
      fetchCrdt({ id }).pipe(
        Effect.flatMap(
          Option.match({
            onNone: () => Effect.fail(new PostNotFoundError({ id })),
            onSome: Effect.succeed,
          }),
        ),
      )

    const insertCrdt = (input: {
      id: PostId
      loroCrdt: Uint8Array
      ownerProfileId: ProfileId
      createdAt: TimestampColumn
      updatedAt: TimestampColumn
    }) =>
      sql`INSERT INTO post_crdts (id, loro_crdt, owner_profile_id, created_at, updated_at) VALUES (${input.id}, ${input.loroCrdt}, ${input.ownerProfileId}, ${input.createdAt}, ${input.updatedAt})`

    const updateCrdt = (input: { id: PostId; loroCrdt: Uint8Array; updatedAt: string }) =>
      sql`UPDATE post_crdts SET loro_crdt = ${input.loroCrdt}, updated_at = ${input.updatedAt} WHERE id = ${input.id}`

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

    const delete_ = (id: PostId) =>
      Effect.gen(function* () {
        yield* sql`DELETE FROM post_translations WHERE post_id = ${id}`
        yield* sql`DELETE FROM post_tags WHERE post_id = ${id}`
        yield* sql`DELETE FROM post_vegetables WHERE post_id = ${id}`
        yield* sql`DELETE FROM post_commits WHERE post_id = ${id}`
        yield* sql`DELETE FROM posts WHERE id = ${id}`
        yield* sql`DELETE FROM post_crdts WHERE id = ${id}`
      })

    const InsertMain = SqlSchema.void({
      Request: PostRow,
      execute: (request) =>
        sql`INSERT INTO posts ${sql.insert(request)} ON CONFLICT(id) DO UPDATE SET ${sql.update}`,
    })

    const materializeMain = Effect.fn("a")(function* (data: {
      currentCrdtFrontier: LoroDocFrontier
      metadata: NoteSourceData["metadata"] | EventSourceData["metadata"]
      postId: PostId
      ownerProfileId: ProfileId
    }) {
      const now = yield* DateTime.now
      const { metadata } = data
      const isEvent = metadata.kind === "EVENT"
      const eventMeta = isEvent ? (metadata as EventSourceData["metadata"]) : null

      return yield* InsertMain({
        ...metadata,
        createdAt: now,
        updatedAt: now,
        currentCrdtFrontier: data.currentCrdtFrontier,
        id: data.postId,
        attendanceMode: eventMeta?.attendanceMode,
        endDate: eventMeta?.endDate,
        startDate: eventMeta?.startDate,
        locationOrUrl: eventMeta?.locationOrUrl,
      })
    })

    const materializeTranslations = (data: {
      currentCrdtFrontier: LoroDocFrontier
      locales: NoteSourceData["locales"] | EventSourceData["locales"]
      postId: PostId
    }) =>
      Effect.gen(function* () {
        const { currentCrdtFrontier, locales, postId } = data

        yield* sql`DELETE FROM post_translations WHERE post_id = ${postId}`

        for (const [locale, localeData] of Object.entries(locales)) {
          if (!localeData) continue

          const plainText = JSON.stringify(localeData.content)
            .replace(/<[^>]*>/g, " ")
            .replace(/\s+/g, " ")
            .trim()
            .slice(0, 500)

          yield* sql`
            INSERT INTO post_translations (
              post_id, locale, content, content_plain_text,
              translated_at_crdt_frontier, translation_source, original_locale
            ) VALUES (
              ${postId}, ${locale}, ${JSON.stringify(localeData.content)},
              ${plainText},
              ${currentCrdtFrontier}, ${localeData.translationSource}, ${localeData.originalLocale}
            )
          `
        }
      })

    const PostTagInsert = Schema.Struct({
      extraction_text: Schema.String,
      post_id: PostId,
      tag_id: TagId,
    })

    const PostVegetableInsert = Schema.Struct({
      extraction_text: Schema.String,
      post_id: PostId,
      vegetable_id: VegetableId,
    })

    const insertTags = SqlSchema.void({
      Request: Schema.Array(PostTagInsert),
      execute: (rows) => sql`INSERT INTO post_tags ${sql.insert(rows)}`,
    })

    const insertVegetables = SqlSchema.void({
      Request: Schema.Array(PostVegetableInsert),
      execute: (rows) => sql`INSERT INTO post_vegetables ${sql.insert(rows)}`,
    })

    const materializeTags = (data: { classification: PostClassification | null; postId: PostId }) =>
      Effect.gen(function* () {
        const { classification, postId } = data

        yield* sql`DELETE FROM post_tags WHERE post_id = ${postId}`

        if (!classification) return

        const existingTags = classification.tags.flatMap((t) =>
          t._tag === "ResolvedExistingTagExtraction"
            ? {
                extraction_text: t.extraction_text,
                post_id: postId,
                tag_id: t.tag_id,
              }
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

        const existingVegetables = classification.vegetables
          .filter(
            (veg): veg is Extract<typeof veg, { _tag: "ResolvedExistingVegetableExtraction" }> =>
              veg._tag === "ResolvedExistingVegetableExtraction",
          )
          .map((veg) => ({
            extraction_text: veg.extraction_text,
            post_id: postId,
            vegetable_id: veg.vegetable_id,
          }))

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
      Effect.all(
        [
          materializeMain(data),
          materializeTranslations(data),
          materializeTags({ classification: data.classification ?? null, postId: data.postId }),
          materializeVegetables({
            classification: data.classification ?? null,
            postId: data.postId,
          }),
        ],
        { concurrency: "unbounded" },
      )

    return {
      delete: delete_,
      findByHandle,
      findById,
      findCommits,
      findTranslation,
      getCrdt,
      getPageData,
      insertCommit,
      insertCrdt,
      materialize,
      updateCrdt,
    } as const
  }),
}) {}
