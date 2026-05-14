import {
  type CrdtCommit,
  EMPTY_LORO_DOC_FRONTIER,
  type EventSourceData,
  Handle,
  HumanCommit,
  IdGen,
  Locale,
  LoroDocFrontier,
  type NoteSourceData,
  type PostClassification,
  PostCommitId,
  PostCommitRow,
  PostCrdtRow,
  PostConcurrentUpdateError,
  PostId,
  PostNotFoundError,
  PostPageData,
  PostRow,
  PostTagRow,
  PostTranslationRow,
  PostVegetableRow,
  ProfileId,
  type SourcePostData,
  tiptapToText,
} from "@gororobas/domain"
import { GetPostPageParams } from "@gororobas/domain/posts/api"
import { Context, DateTime, Effect, Option, Schema, Struct } from "effect"
import { SqlClient, SqlSchema } from "effect/unstable/sql"

import {
  persistCrdtDocumentCreation,
  persistCrdtDocumentUpdate,
} from "../common/crdt-aggregate-persistence.js"
import { materializeJunctionTable } from "../common/table-materialization.js"
import { createPostSnapshot, evolvePostSnapshot } from "./post-crdt-orchestration.js"
import {
  type CreatePostInput as CreatePostInputType,
  type UpdatePostInput as UpdatePostInputType,
} from "./post-repository-inputs.js"

/**
 * Posts repository with CRUD orchestration:
 * - public read queries for the front-end and policy checks
 * - createPost/updatePost/deletePost as the write surface
 */
export class PostsRepository extends Context.Service<PostsRepository>()("PostsRepository", {
  make: Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient

    /**
     * ======================
     *         READS
     * ======================
     */

    const listPostCommitRowsByPostIdAsc = SqlSchema.findAll({
      Request: PostId,
      Result: PostCommitRow,
      execute: (postId) =>
        sql`SELECT * FROM post_commits WHERE post_id = ${postId} ORDER BY created_at ASC`,
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

    const listPostTranslationRowsByPostId = SqlSchema.findAll({
      Request: PostId,
      Result: PostTranslationRow,
      execute: (postId) => sql`SELECT * FROM post_translations WHERE post_id = ${postId}`,
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
         target_post AS (
             SELECT *
             FROM posts
             WHERE handle = ${req.handle}
             LIMIT 1
         ),
         best_translation AS (
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
                 ) AS priority_rank
             FROM post_translations pt
             INNER JOIN target_post ON target_post.id = pt.post_id
         ),
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
             t.locale,
             t.original_locale,
             t.content,
             tags.tags,
             vegs.vegetables
         FROM target_post p
         LEFT JOIN best_translation t ON t.priority_rank = 1
         LEFT JOIN aggregated_tags tags ON TRUE
         LEFT JOIN aggregated_vegetables vegs ON TRUE
       `,
      Request: GetPostPageParams,
      Result: PostPageData,
    })

    const findPostRowById = SqlSchema.findOneOption({
      Request: PostId,
      Result: PostRow,
      execute: (id) => sql`SELECT * FROM posts WHERE id = ${id}`,
    })

    const findPostRowByHandle = SqlSchema.findOneOption({
      Request: Handle,
      Result: PostRow,
      execute: (handle) => sql`SELECT * FROM posts WHERE handle = ${handle}`,
    })

    const findPostCrdtSnapshotById = SqlSchema.findOneOption({
      Request: PostId,
      Result: PostCrdtRow.mapFields(Struct.pick(["crdtSnapshot"])),
      execute: (id) => sql`SELECT crdt_snapshot FROM post_crdts WHERE id = ${id}`,
    })

    /**
     * ======================
     *        WRITES
     * ======================
     */

    const deletePost = SqlSchema.void({
      Request: PostId,
      execute: (postId) => sql`DELETE FROM post_crdts WHERE id = ${postId}`,
    })

    const insertPostCommitRow = SqlSchema.void({
      Request: PostCommitRow,
      execute: (row) => sql`INSERT INTO post_commits ${sql.insert(row)}`,
    })

    const insertPostCrdtRow = SqlSchema.void({
      Request: PostCrdtRow,
      execute: (row) => sql`INSERT INTO post_crdts ${sql.insert(row)}`,
    })

    const insertPostCommit = (input: {
      commit: CrdtCommit
      crdtUpdate: PostCommitRow["crdtUpdate"]
      fromCrdtFrontier: PostCommitRow["fromCrdtFrontier"]
      postId: PostId
    }) =>
      Effect.gen(function* () {
        const id = yield* IdGen.make(PostCommitId)
        const now = yield* DateTime.now
        const createdById = input.commit._tag === "HumanCommit" ? input.commit.personId : null

        yield* insertPostCommitRow(
          PostCommitRow.make({
            createdAt: now,
            createdById,
            crdtUpdate: input.crdtUpdate,
            fromCrdtFrontier: input.fromCrdtFrontier,
            id,
            postId: input.postId,
            updatedAt: now,
          }),
        )
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

    const updatePostCrdtRow = SqlSchema.void({
      Request: PostCrdtRow.mapFields(
        Struct.omit(["classification", "createdAt", "ownerProfileId"]),
      ),
      execute: ({ id, ...update }) =>
        sql`UPDATE post_crdts SET ${sql.update(update)} WHERE id = ${id}`,
    })

    const upsertPostRow = SqlSchema.void({
      Request: PostRow,
      execute: (row) => sql`
        INSERT INTO posts ${sql.insert(row)}
        ON CONFLICT(id) DO UPDATE SET ${sql.update(row, ["id", "createdAt"])}
      `,
    })

    /**
     * ======================
     *    MATERIALIZATION
     * ======================
     */

    const materializePostRow = (input: {
      currentCrdtFrontier: LoroDocFrontier
      metadata: NoteSourceData["metadata"] | EventSourceData["metadata"]
      postId: PostId
    }) =>
      Effect.gen(function* () {
        const now = yield* DateTime.now

        if (input.metadata.kind === "EVENT") {
          yield* upsertPostRow({
            ...input.metadata,
            createdAt: now,
            currentCrdtFrontier: input.currentCrdtFrontier,
            id: input.postId,
            updatedAt: now,
          })
          return
        }

        yield* upsertPostRow({
          ...input.metadata,
          attendanceMode: null,
          createdAt: now,
          currentCrdtFrontier: input.currentCrdtFrontier,
          endDate: null,
          id: input.postId,
          locationOrUrl: null,
          startDate: null,
          updatedAt: now,
        })
      })

    const materializeTranslations = (input: {
      locales: NoteSourceData["locales"]
      postId: PostId
    }) => {
      const rows = Object.entries(input.locales).flatMap(([locale, localeData]) => {
        if (!localeData || !Schema.is(Locale)(locale)) return []

        return PostTranslationRow.make({
          content: localeData.content,
          contentPlainText: tiptapToText(localeData.content),
          locale,
          originalLocale: localeData.originalLocale,
          postId: input.postId,
          translatedAtCrdtFrontier: localeData.translatedAtCrdtFrontier,
          translationSource: localeData.translationSource,
        })
      })

      return materializeJunctionTable({
        deleteRows: sql`DELETE FROM post_translations WHERE post_id = ${input.postId}`,
        insertRows: rows.length > 0 ? insertPostTranslationRows(rows) : Effect.void,
      })
    }

    const materializeTags = (input: {
      classification: PostClassification | null
      postId: PostId
    }) => {
      const rows = (input.classification?.tags ?? []).flatMap((tag) => {
        if (tag._tag !== "ResolvedExistingTagExtraction") return []

        return PostTagRow.make({
          extractionText: tag.extractionText,
          postId: input.postId,
          tagId: tag.tagId,
        })
      })

      return materializeJunctionTable({
        deleteRows: sql`DELETE FROM post_tags WHERE post_id = ${input.postId}`,
        insertRows: rows.length > 0 ? insertPostTagRows(rows) : Effect.void,
      })
    }

    const materializeVegetables = (input: {
      classification: PostClassification | null
      postId: PostId
    }) => {
      const rows = (input.classification?.vegetables ?? []).flatMap((vegetable) => {
        if (vegetable._tag !== "ResolvedExistingVegetableExtraction") return []

        return PostVegetableRow.make({
          extractionText: vegetable.extractionText,
          postId: input.postId,
          vegetableId: vegetable.vegetableId,
        })
      })

      return materializeJunctionTable({
        deleteRows: sql`DELETE FROM post_vegetables WHERE post_id = ${input.postId}`,
        insertRows: rows.length > 0 ? insertPostVegetableRows(rows) : Effect.void,
      })
    }

    const materializePost = (input: {
      classification?: PostClassification | null
      currentCrdtFrontier: LoroDocFrontier
      postId: PostId
      sourceData: SourcePostData
    }) =>
      Effect.gen(function* () {
        yield* materializePostRow({
          currentCrdtFrontier: input.currentCrdtFrontier,
          metadata: input.sourceData.metadata,
          postId: input.postId,
        })

        yield* materializeTranslations({
          locales: input.sourceData.locales,
          postId: input.postId,
        })

        yield* materializeTags({
          classification: input.classification ?? null,
          postId: input.postId,
        })

        yield* materializeVegetables({
          classification: input.classification ?? null,
          postId: input.postId,
        })
      })

    /**
     * ======================
     *    BUSINESS LOGIC
     *     (PUBLIC API)
     * ======================
     */

    const buildSourceDataFromMaterializedRows = (input: {
      postRow: PostRow
      translationRows: Array<PostTranslationRow>
    }): SourcePostData => {
      const toPostLocalizedData = (row: PostTranslationRow) =>
        row.translationSource === "ORIGINAL"
          ? {
              content: row.content,
              originalLocale: row.originalLocale,
              translatedAtCrdtFrontier: null,
              translationSource: "ORIGINAL" as const,
            }
          : {
              content: row.content,
              originalLocale: row.originalLocale,
              translatedAtCrdtFrontier: row.translatedAtCrdtFrontier ?? LoroDocFrontier.make([]),
              translationSource: row.translationSource,
            }

      const enRow = input.translationRows.find((row) => row.locale === "en")
      const esRow = input.translationRows.find((row) => row.locale === "es")
      const ptRow = input.translationRows.find((row) => row.locale === "pt")
      const locales: SourcePostData["locales"] = {
        en: enRow ? toPostLocalizedData(enRow) : undefined,
        es: esRow ? toPostLocalizedData(esRow) : undefined,
        pt: ptRow ? toPostLocalizedData(ptRow) : undefined,
      }

      if (input.postRow.kind === "EVENT") {
        return {
          locales,
          metadata: {
            attendanceMode: input.postRow.attendanceMode,
            endDate: input.postRow.endDate,
            handle: input.postRow.handle,
            kind: "EVENT",
            locationOrUrl: input.postRow.locationOrUrl,
            ownerProfileId: input.postRow.ownerProfileId,
            publishedAt: input.postRow.publishedAt,
            startDate: input.postRow.startDate!,
            visibility: input.postRow.visibility!,
          },
        }
      }

      return {
        locales,
        metadata: {
          handle: input.postRow.handle,
          kind: "NOTE",
          ownerProfileId: input.postRow.ownerProfileId,
          publishedAt: input.postRow.publishedAt,
          visibility: input.postRow.visibility!,
        },
      }
    }

    const createPost = (input: CreatePostInputType) =>
      Effect.gen(function* () {
        const postId = yield* IdGen.make(PostId)
        const now = yield* DateTime.now
        const created = createPostSnapshot(input.sourceData)

        yield* persistCrdtDocumentCreation({
          insertCrdt: insertPostCrdtRow(
            PostCrdtRow.make({
              classification: null,
              createdAt: now,
              crdtSnapshot: created.crdtSnapshot,
              id: postId,
              ownerProfileId: input.sourceData.metadata.ownerProfileId,
              updatedAt: now,
            }),
          ),
          insertCommitOrRevision: insertPostCommit({
            commit: HumanCommit.make({ personId: input.createdById }),
            crdtUpdate: created.initialCrdtUpdate,
            fromCrdtFrontier: EMPTY_LORO_DOC_FRONTIER,
            postId,
          }),
          materialize: materializePost({
            currentCrdtFrontier: created.currentCrdtFrontier,
            postId,
            sourceData: created.sourceData,
          }),
        })

        return postId
      })

    const updatePost = (input: UpdatePostInputType) =>
      Effect.gen(function* () {
        const current = yield* findPostCrdtSnapshotById(input.postId).pipe(
          Effect.flatMap(
            Option.match({
              onNone: () => Effect.fail(new PostNotFoundError({ id: input.postId })),
              onSome: Effect.succeed,
            }),
          ),
        )
        const postRow = yield* findPostRowById(input.postId).pipe(
          Effect.flatMap(
            Option.match({
              onNone: () => Effect.fail(new PostNotFoundError({ id: input.postId })),
              onSome: Effect.succeed,
            }),
          ),
        )

        if (
          JSON.stringify(postRow.currentCrdtFrontier) !==
          JSON.stringify(input.expectedCurrentCrdtFrontier)
        ) {
          return yield* new PostConcurrentUpdateError({ id: input.postId })
        }

        const translationRows = yield* listPostTranslationRowsByPostId(input.postId)
        const currentSourceData = buildSourceDataFromMaterializedRows({
          postRow,
          translationRows,
        })
        const nextSourceData: SourcePostData =
          input._tag === "HumanUpdatePtContent"
            ? {
                ...currentSourceData,
                locales: {
                  ...currentSourceData.locales,
                  pt: currentSourceData.locales.pt
                    ? { ...currentSourceData.locales.pt, content: input.content }
                    : {
                        content: input.content,
                        originalLocale: "pt",
                        translatedAtCrdtFrontier: null,
                        translationSource: "ORIGINAL",
                      },
                },
              }
            : {
                ...currentSourceData,
                locales: {
                  ...currentSourceData.locales,
                  [input.targetLocale]: {
                    content: input.translatedContent,
                    originalLocale: input.sourceLocale,
                    translatedAtCrdtFrontier: input.expectedCurrentCrdtFrontier,
                    translationSource: "AUTOMATIC",
                  },
                },
              }

        const commit: CrdtCommit =
          input._tag === "HumanUpdatePtContent"
            ? HumanCommit.make({ personId: input.authorId })
            : input.commit

        const evolved = yield* evolvePostSnapshot({
          commit,
          nextSourceData,
          snapshot: current.crdtSnapshot,
        })

        const now = yield* DateTime.now

        yield* persistCrdtDocumentUpdate({
          updateCrdtRow: updatePostCrdtRow({
            crdtSnapshot: evolved.nextSnapshot,
            id: input.postId,
            updatedAt: now,
          }),
          insertCommitOrUpdateRevision: insertPostCommit({
            commit: evolved.commit,
            crdtUpdate: evolved.crdtUpdate,
            fromCrdtFrontier: evolved.fromCrdtFrontier,
            postId: input.postId,
          }),
          materialize: materializePost({
            currentCrdtFrontier: evolved.nextFrontier,
            postId: input.postId,
            sourceData: evolved.sourceData,
          }),
        })
      })

    return {
      countPostRowsByOwnerProfileId,
      createPost,
      deletePost,
      findPostPageData,
      findPostRowByHandle,
      findPostRowById,
      listPostCommitRowsByPostIdAsc,
      listPostContributorIdsByPostId,
      listPostRowsByOwnerProfileId,
      updatePost,
    } as const
  }),
}) {}
