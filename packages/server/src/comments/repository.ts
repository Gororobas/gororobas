import {
  CommentCommitId,
  CommentCommitRow,
  CommentConcurrentUpdateError,
  CommentCrdtRow,
  CommentId,
  CommentNotFoundError,
  CommentRow,
  CommentTranslationRow,
  EMPTY_LORO_DOC_FRONTIER,
  type CrdtCommit,
  HumanCommit,
  IdGen,
  Locale,
  LoroDocFrontier,
  LoroDocSnapshot,
  PostId,
  ResourceId,
  SourceCommentData,
  TiptapDocument,
  TimestampColumn,
  tiptapToText,
} from "@gororobas/domain"
import { DateTime, Effect, Option, Schema, Context } from "effect"
import { SqlClient, SqlSchema } from "effect/unstable/sql"

import {
  persistCrdtAggregateCreation,
  persistCrdtAggregateUpdate,
} from "../common/crdt-aggregate-persistence.js"
import { createCommentSnapshot, evolveCommentSnapshot } from "./comment-crdt-orchestration.js"
import { type CreateCommentInput, type UpdateCommentInput } from "./comment-repository-inputs.js"

export class CommentsRepository extends Context.Service<CommentsRepository>()(
  "CommentsRepository",
  {
    make: Effect.gen(function* () {
      const sql = yield* SqlClient.SqlClient

      const findCommentRowById = SqlSchema.findOneOption({
        Request: CommentId,
        Result: CommentRow,
        execute: (id) => sql`SELECT * FROM comments WHERE id = ${id}`,
      })

      const findCommentCrdtSnapshotById = SqlSchema.findOneOption({
        Request: CommentId,
        Result: Schema.Struct({ crdtSnapshot: LoroDocSnapshot }),
        execute: (id) => sql`SELECT crdt_snapshot FROM comment_crdts WHERE id = ${id}`,
      })

      const listCommentTranslationRowsByCommentId = SqlSchema.findAll({
        Request: CommentId,
        Result: CommentTranslationRow,
        execute: (commentId) =>
          sql`SELECT * FROM comment_translations WHERE comment_id = ${commentId}`,
      })

      const insertCommentCrdtRow = (input: {
        createdAt: TimestampColumn
        id: CommentId
        crdtSnapshot: LoroDocSnapshot
        moderationStatus: CommentCrdtRow["moderationStatus"]
        ownerProfileId: CommentCrdtRow["ownerProfileId"]
        parentCommentId: CommentCrdtRow["parentCommentId"]
        postId: CommentCrdtRow["postId"]
        resourceId: CommentCrdtRow["resourceId"]
        updatedAt: TimestampColumn
      }) =>
        sql`INSERT INTO comment_crdts (id, post_id, resource_id, parent_comment_id, crdt_snapshot, owner_profile_id, moderation_status, created_at, updated_at) VALUES (${input.id}, ${input.postId}, ${input.resourceId}, ${input.parentCommentId}, ${input.crdtSnapshot}, ${input.ownerProfileId}, ${input.moderationStatus}, ${DateTime.formatIso(input.createdAt)}, ${DateTime.formatIso(input.updatedAt)})`

      const updateCommentCrdtRowWithExpectedFrontier = (input: {
        id: CommentId
        crdtSnapshot: LoroDocSnapshot
        expectedCurrentCrdtFrontier: LoroDocFrontier
        nextCurrentCrdtFrontier: LoroDocFrontier
        updatedAt: TimestampColumn
      }) =>
        Effect.gen(function* () {
          yield* sql`
            UPDATE comment_crdts
            SET crdt_snapshot = ${input.crdtSnapshot}, updated_at = ${DateTime.formatIso(input.updatedAt)}
            WHERE id = ${input.id}
          `

          yield* sql`
            UPDATE comments
            SET current_crdt_frontier = ${JSON.stringify(input.nextCurrentCrdtFrontier)}
            WHERE id = ${input.id} AND current_crdt_frontier = ${JSON.stringify(input.expectedCurrentCrdtFrontier)}
          `

          const { count } = yield* SqlSchema.findOne({
            Request: Schema.Null,
            Result: Schema.Struct({ count: Schema.Number }),
            execute: () => sql`SELECT changes() as count`,
          })(null)

          return count === 1
        })

      const insertCommentCommitRow = SqlSchema.void({
        Request: CommentCommitRow,
        execute: (row) => sql`INSERT INTO comment_commits ${sql.insert(row)}`,
      })

      const insertCommentCommit = (input: {
        commit: CrdtCommit
        commentId: CommentId
        crdtUpdate: CommentCommitRow["crdtUpdate"]
        fromCrdtFrontier: CommentCommitRow["fromCrdtFrontier"]
      }) =>
        Effect.gen(function* () {
          const id = yield* IdGen.make(CommentCommitId)
          const now = yield* DateTime.now
          const createdById = input.commit._tag === "HumanCommit" ? input.commit.personId : null

          yield* insertCommentCommitRow({
            commentId: input.commentId,
            createdAt: now,
            createdById,
            crdtUpdate: input.crdtUpdate,
            fromCrdtFrontier: input.fromCrdtFrontier,
            id,
          })
        })

      const upsertCommentRow = SqlSchema.void({
        Request: CommentRow,
        execute: (row) => sql`
          INSERT INTO comments (
            id,
            post_id,
            resource_id,
            parent_comment_id,
            current_crdt_frontier,
            moderation_status,
            created_at,
            updated_at,
            owner_profile_id
          ) VALUES (
            ${row.id},
            ${row.postId},
            ${row.resourceId},
            ${row.parentCommentId},
            ${row.currentCrdtFrontier},
            ${row.moderationStatus},
            ${row.createdAt},
            ${row.updatedAt},
            ${row.ownerProfileId}
          )
          ON CONFLICT(id) DO UPDATE SET
            current_crdt_frontier = excluded.current_crdt_frontier,
            moderation_status = excluded.moderation_status,
            updated_at = excluded.updated_at
        `,
      })

      const insertCommentTranslationRows = SqlSchema.void({
        Request: Schema.Array(CommentTranslationRow),
        execute: (rows) => sql`INSERT INTO comment_translations ${sql.insert(rows)}`,
      })

      const materializeCommentRow = (input: {
        commentId: CommentId
        currentCrdtFrontier: LoroDocFrontier
        moderationStatus: CommentRow["moderationStatus"]
        ownerProfileId: CommentRow["ownerProfileId"]
        parentCommentId: CommentRow["parentCommentId"]
        postId: CommentRow["postId"]
        resourceId: CommentRow["resourceId"]
      }) =>
        Effect.gen(function* () {
          const now = yield* DateTime.now

          yield* upsertCommentRow({
            createdAt: now,
            currentCrdtFrontier: input.currentCrdtFrontier,
            id: input.commentId,
            moderationStatus: input.moderationStatus,
            ownerProfileId: input.ownerProfileId,
            parentCommentId: input.parentCommentId,
            postId: input.postId,
            resourceId: input.resourceId,
            updatedAt: now,
          })
        })

      const materializeTranslations = (input: {
        commentId: CommentId
        locales: SourceCommentData["locales"]
      }) =>
        Effect.gen(function* () {
          yield* sql`DELETE FROM comment_translations WHERE comment_id = ${input.commentId}`

          const translationRows = Object.entries(input.locales).flatMap(([locale, localeData]) => {
            if (!localeData || !Schema.is(Locale)(locale)) return []

            return CommentTranslationRow.make({
              commentId: input.commentId,
              content: localeData.content,
              contentPlainText: tiptapToText(localeData.content),
              locale,
              originalLocale: localeData.originalLocale,
              translatedAtCrdtFrontier: localeData.translatedAtCrdtFrontier,
              translationSource: localeData.translationSource,
            })
          })

          if (translationRows.length === 0) return
          yield* insertCommentTranslationRows(translationRows)
        })

      const materialize = (input: {
        commentId: CommentId
        currentCrdtFrontier: LoroDocFrontier
        moderationStatus: CommentRow["moderationStatus"]
        ownerProfileId: CommentRow["ownerProfileId"]
        parentCommentId: CommentRow["parentCommentId"]
        postId: CommentRow["postId"]
        resourceId: CommentRow["resourceId"]
        sourceData: SourceCommentData
      }) =>
        Effect.gen(function* () {
          yield* materializeCommentRow({
            commentId: input.commentId,
            currentCrdtFrontier: input.currentCrdtFrontier,
            moderationStatus: input.moderationStatus,
            ownerProfileId: input.ownerProfileId,
            parentCommentId: input.parentCommentId,
            postId: input.postId,
            resourceId: input.resourceId,
          })

          yield* materializeTranslations({
            commentId: input.commentId,
            locales: input.sourceData.locales,
          })
        })

      const buildSourceDataFromMaterializedRows = (
        translationRows: Array<CommentTranslationRow>,
      ) => {
        const toLocalizedData = (row: CommentTranslationRow) =>
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

        const enRow = translationRows.find((row) => row.locale === "en")
        const esRow = translationRows.find((row) => row.locale === "es")
        const ptRow = translationRows.find((row) => row.locale === "pt")

        return {
          locales: {
            en: enRow ? toLocalizedData(enRow) : undefined,
            es: esRow ? toLocalizedData(esRow) : undefined,
            pt: ptRow ? toLocalizedData(ptRow) : undefined,
          },
        } as const
      }

      const createComment = (input: CreateCommentInput) =>
        Effect.gen(function* () {
          const commentId = yield* IdGen.make(CommentId)
          const now = yield* DateTime.now
          const created = createCommentSnapshot(input.sourceData)

          return yield* persistCrdtAggregateCreation({
            insertCrdt: insertCommentCrdtRow({
              createdAt: now,
              id: commentId,
              crdtSnapshot: created.crdtSnapshot,
              moderationStatus: "APPROVED_BY_DEFAULT",
              ownerProfileId: input.ownerProfileId,
              parentCommentId: input.parentCommentId,
              postId: input.postId,
              resourceId: input.resourceId,
              updatedAt: now,
            }),
            insertInitialCommit: insertCommentCommit({
              commentId,
              commit: HumanCommit.make({ personId: input.createdById }),
              crdtUpdate: created.initialCrdtUpdate,
              fromCrdtFrontier: EMPTY_LORO_DOC_FRONTIER,
            }),
            materialize: materialize({
              commentId,
              currentCrdtFrontier: created.currentCrdtFrontier,
              moderationStatus: "APPROVED_BY_DEFAULT",
              ownerProfileId: input.ownerProfileId,
              parentCommentId: input.parentCommentId,
              postId: input.postId,
              resourceId: input.resourceId,
              sourceData: created.sourceData,
            }),
            result: commentId,
            sql,
          })
        })

      const updateComment = (input: UpdateCommentInput) =>
        Effect.gen(function* () {
          const current = yield* findCommentCrdtSnapshotById(input.commentId).pipe(
            Effect.flatMap(
              Option.match({
                onNone: () => Effect.fail(new CommentNotFoundError({ id: input.commentId })),
                onSome: Effect.succeed,
              }),
            ),
          )

          const row = yield* findCommentRowById(input.commentId).pipe(
            Effect.flatMap(
              Option.match({
                onNone: () => Effect.fail(new CommentNotFoundError({ id: input.commentId })),
                onSome: Effect.succeed,
              }),
            ),
          )

          const translationRows = yield* listCommentTranslationRowsByCommentId(input.commentId)
          const currentSourceData = buildSourceDataFromMaterializedRows(translationRows)

          const nextSourceData: SourceCommentData =
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

          const evolved = yield* evolveCommentSnapshot({
            commit,
            nextSourceData,
            snapshot: current.crdtSnapshot,
          })

          const now = yield* DateTime.now

          yield* persistCrdtAggregateUpdate({
            ensureSnapshotUpdated: updateCommentCrdtRowWithExpectedFrontier({
              crdtSnapshot: evolved.nextSnapshot,
              expectedCurrentCrdtFrontier: input.expectedCurrentCrdtFrontier,
              id: input.commentId,
              nextCurrentCrdtFrontier: evolved.nextFrontier,
              updatedAt: now,
            }),
            insertCommit: insertCommentCommit({
              commentId: input.commentId,
              commit: evolved.commit,
              crdtUpdate: evolved.crdtUpdate,
              fromCrdtFrontier: evolved.fromCrdtFrontier,
            }),
            materialize: materialize({
              commentId: input.commentId,
              currentCrdtFrontier: evolved.nextFrontier,
              moderationStatus: row.moderationStatus,
              ownerProfileId: row.ownerProfileId,
              parentCommentId: row.parentCommentId,
              postId: row.postId,
              resourceId: row.resourceId,
              sourceData: evolved.sourceData,
            }),
            onConflict: Effect.fail(new CommentConcurrentUpdateError({ id: input.commentId })),
            sql,
          })
        })

      const deleteComment = SqlSchema.void({
        Request: CommentId,
        execute: (commentId) => sql`DELETE FROM comment_crdts WHERE id = ${commentId}`,
      })

      const listCommentCommitRowsByCommentIdAsc = SqlSchema.findAll({
        Request: CommentId,
        Result: CommentCommitRow,
        execute: (commentId) =>
          sql`SELECT * FROM comment_commits WHERE comment_id = ${commentId} ORDER BY created_at ASC`,
      })

      const listCommentRowsByPostId = SqlSchema.findAll({
        Request: PostId,
        Result: CommentRow,
        execute: (postId) =>
          sql`SELECT * FROM comments WHERE post_id = ${postId} ORDER BY created_at ASC`,
      })

      const listCommentRowsByResourceId = SqlSchema.findAll({
        Request: ResourceId,
        Result: CommentRow,
        execute: (resourceId) =>
          sql`SELECT * FROM comments WHERE resource_id = ${resourceId} ORDER BY created_at ASC`,
      })

      const findCommentContentByIdAndLocale = SqlSchema.findOneOption({
        Request: Schema.Struct({ commentId: CommentId, locale: Locale }),
        Result: Schema.Struct({ content: Schema.fromJsonString(TiptapDocument) }),
        execute: (request) => sql`
          SELECT content
          FROM comment_translations
          WHERE comment_id = ${request.commentId} AND locale = ${request.locale}
        `,
      })

      return {
        createComment,
        deleteComment,
        findCommentContentByIdAndLocale,
        findCommentRowById,
        listCommentCommitRowsByCommentIdAsc,
        listCommentRowsByPostId,
        listCommentRowsByResourceId,
        updateComment,
      } as const
    }),
  },
) {}
