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
  PostId,
  ResourceId,
  SourceCommentData,
  TiptapDocument,
  tiptapToText,
} from "@gororobas/domain"
import { Context, DateTime, Effect, Equal, Option, Schema, Struct } from "effect"
import { SqlClient, SqlSchema } from "effect/unstable/sql"

import {
  persistCrdtDocumentCreation,
  persistCrdtDocumentUpdate,
} from "../common/crdt-aggregate-persistence.js"
import { materializeJunctionTable } from "../common/table-materialization.js"
import { createCommentSnapshot, evolveCommentSnapshot } from "./comment-crdt-orchestration.js"
import { type CreateCommentInput, type UpdateCommentInput } from "./comment-repository-inputs.js"

export class CommentsRepository extends Context.Service<CommentsRepository>()(
  "CommentsRepository",
  {
    make: Effect.gen(function* () {
      const sql = yield* SqlClient.SqlClient

      /**
       * ======================
       *         READS
       * ======================
       */

      const findCommentRowById = SqlSchema.findOneOption({
        Request: CommentId,
        Result: CommentRow,
        execute: (id) => sql`SELECT * FROM comments WHERE id = ${id}`,
      })

      const findCommentCrdtSnapshotById = SqlSchema.findOneOption({
        Request: CommentId,
        Result: CommentCrdtRow.mapFields(Struct.pick(["crdtSnapshot"])),
        execute: (id) => sql`SELECT crdt_snapshot FROM comment_crdts WHERE id = ${id}`,
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

      const listCommentTranslationRowsByCommentId = SqlSchema.findAll({
        Request: CommentId,
        Result: CommentTranslationRow,
        execute: (commentId) =>
          sql`SELECT * FROM comment_translations WHERE comment_id = ${commentId}`,
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

      /**
       * ======================
       *        WRITES
       * ======================
       */

      const deleteComment = SqlSchema.void({
        Request: CommentId,
        execute: (commentId) => sql`DELETE FROM comment_crdts WHERE id = ${commentId}`,
      })

      const insertCommentCrdtRow = SqlSchema.void({
        Request: CommentCrdtRow,
        execute: (row) => sql`INSERT INTO comment_crdts ${sql.insert(row)}`,
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

          yield* insertCommentCommitRow(
            CommentCommitRow.make({
              commentId: input.commentId,
              createdAt: now,
              createdById,
              crdtUpdate: input.crdtUpdate,
              fromCrdtFrontier: input.fromCrdtFrontier,
              id,
            }),
          )
        })

      const insertCommentTranslationRows = SqlSchema.void({
        Request: Schema.Array(CommentTranslationRow),
        execute: (rows) => sql`INSERT INTO comment_translations ${sql.insert(rows)}`,
      })

      const updateCommentCrdtRow = SqlSchema.void({
        Request: CommentCrdtRow.mapFields(
          Struct.omit([
            "createdAt",
            "moderationStatus",
            "ownerProfileId",
            "parentCommentId",
            "postId",
            "resourceId",
          ]),
        ),
        execute: ({ id, ...update }) =>
          sql`UPDATE comment_crdts SET ${sql.update(update)} WHERE id = ${id}`,
      })

      const upsertCommentRow = SqlSchema.void({
        Request: CommentRow,
        execute: (row) => sql`
            INSERT INTO comments ${sql.insert(row)}
            ON CONFLICT(id) DO UPDATE SET ${sql.update(row, ["id", "createdAt", "postId", "resourceId", "parentCommentId", "ownerProfileId"])}
        `,
      })

      /**
       * ======================
       *    MATERIALIZATION
       * ======================
       */

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
      }) => {
        const rows = Object.entries(input.locales).flatMap(([locale, localeData]) => {
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

        return materializeJunctionTable({
          deleteRows: sql`DELETE FROM comment_translations WHERE comment_id = ${input.commentId}`,
          insertRows: rows.length > 0 ? insertCommentTranslationRows(rows) : Effect.void,
        })
      }

      const materializeComment = (input: {
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

      /**
       * ======================
       *    BUSINESS LOGIC
       *     (PUBLIC API)
       * ======================
       */

      const createComment = (input: CreateCommentInput) =>
        Effect.gen(function* () {
          const commentId = yield* IdGen.make(CommentId)
          const now = yield* DateTime.now
          const created = createCommentSnapshot(input.sourceData)

          yield* persistCrdtDocumentCreation({
            insertCrdt: insertCommentCrdtRow(
              CommentCrdtRow.make({
                createdAt: now,
                crdtSnapshot: created.crdtSnapshot,
                id: commentId,
                moderationStatus: "APPROVED_BY_DEFAULT",
                ownerProfileId: input.ownerProfileId,
                parentCommentId: input.parentCommentId,
                postId: input.postId,
                resourceId: input.resourceId,
                updatedAt: now,
              }),
            ),
            insertCommitOrRevision: insertCommentCommit({
              commentId,
              commit: HumanCommit.make({ personId: input.createdById }),
              crdtUpdate: created.initialCrdtUpdate,
              fromCrdtFrontier: EMPTY_LORO_DOC_FRONTIER,
            }),
            materialize: materializeComment({
              commentId,
              currentCrdtFrontier: created.currentCrdtFrontier,
              moderationStatus: "APPROVED_BY_DEFAULT",
              ownerProfileId: input.ownerProfileId,
              parentCommentId: input.parentCommentId,
              postId: input.postId,
              resourceId: input.resourceId,
              sourceData: created.sourceData,
            }),
          })

          return commentId
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

          const commentRow = yield* findCommentRowById(input.commentId).pipe(
            Effect.flatMap(
              Option.match({
                onNone: () => Effect.fail(new CommentNotFoundError({ id: input.commentId })),
                onSome: Effect.succeed,
              }),
            ),
          )

          if (!Equal.equals(commentRow.currentCrdtFrontier, input.expectedCurrentCrdtFrontier)) {
            return yield* new CommentConcurrentUpdateError({ id: input.commentId })
          }

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

          yield* persistCrdtDocumentUpdate({
            updateCrdtRow: updateCommentCrdtRow({
              crdtSnapshot: evolved.nextSnapshot,
              id: input.commentId,
              updatedAt: now,
            }),
            insertCommitOrUpdateRevision: insertCommentCommit({
              commentId: input.commentId,
              commit: evolved.commit,
              crdtUpdate: evolved.crdtUpdate,
              fromCrdtFrontier: evolved.fromCrdtFrontier,
            }),
            materialize: materializeComment({
              commentId: input.commentId,
              currentCrdtFrontier: evolved.nextFrontier,
              moderationStatus: commentRow.moderationStatus,
              ownerProfileId: commentRow.ownerProfileId,
              parentCommentId: commentRow.parentCommentId,
              postId: commentRow.postId,
              resourceId: commentRow.resourceId,
              sourceData: evolved.sourceData,
            }),
          })
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
