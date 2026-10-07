import {
  CommentCommitId,
  CommentCommitRow,
  CommentConcurrentUpdateError,
  CommentCrdtRow,
  CommentId,
  CommentNotFoundError,
  CommentRow,
  CommentTranslationRow,
  CommentCrdt,
  EMPTY_LORO_DOC_FRONTIER,
  type CrdtCommit,
  HumanCommit,
  IdGen,
  Locale,
  LoroDocFrontier,
  SourceCommentData,
  tiptapToText,
} from "@gororobas/domain"
import {
  Array as EffectArray,
  Context,
  DateTime,
  Effect,
  Equal,
  Option,
  Record,
  Schema,
  Predicate,
} from "effect"
import { SqlClient } from "effect/sql"

import {
  persistCrdtDocumentCreation,
  persistCrdtDocumentUpdate,
} from "../common/crdt-aggregate-persistence.js"
import { persistProjectionJunctionTables } from "../common/table-projection.js"
import { type CreateCommentInput, type UpdateCommentInput } from "./comment-repository-inputs.js"
import {
  deleteComment,
  censorComment,
  insertCommentCommitRow,
  insertCommentCrdtRow,
  insertCommentTranslationRows,
  updateCommentCrdtRow,
  upsertCommentRow,
} from "./mutations.js"
import {
  findCommentContentByIdAndLocale,
  findCommentCrdtSnapshotById,
  findCommentRowById,
  listCommentCommitRowsByCommentIdAsc,
  listCommentRowsByPublicationId,
} from "./queries.js"
export class CommentsRepository extends Context.Service<CommentsRepository>()(
  "CommentsRepository",
  {
    make: Effect.gen(function* () {
      const sql = yield* SqlClient.SqlClient

      const insertCommentCommit = (input: {
        commit: CrdtCommit
        commentId: CommentId
        crdtUpdate: CommentCommitRow["crdtUpdate"]
        fromCrdtFrontier: CommentCommitRow["fromCrdtFrontier"]
      }) =>
        Effect.gen(function* () {
          const id = yield* IdGen.make(CommentCommitId)
          const now = yield* DateTime.now
          const createdById = Predicate.isTagged(input.commit, "HumanCommit")
            ? input.commit.personId
            : null

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

      /**
       * ======================
       *    PROJECTION PERSISTENCE
       * ======================
       */

      const persistCommentProjectionRow = (input: {
        commentId: CommentId
        currentCrdtFrontier: LoroDocFrontier
        moderationStatus: CommentRow["moderationStatus"]
        ownerProfileId: CommentRow["ownerProfileId"]
        parentCommentId: CommentRow["parentCommentId"]
        publicationId: CommentRow["publicationId"]
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
            publicationId: input.publicationId,
            updatedAt: now,
          })
        })

      const persistTranslationProjections = (input: {
        commentId: CommentId
        locales: SourceCommentData["locales"]
      }) => {
        const rows = Record.toEntries({
          en: input.locales.en,
          es: input.locales.es,
          pt: input.locales.pt,
        }).flatMap(([locale, localeData]) => {
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

        return persistProjectionJunctionTables({
          deleteRows: sql`DELETE FROM comment_translations WHERE comment_id = ${input.commentId}`,
          insertRows: EffectArray.isReadonlyArrayNonEmpty(rows)
            ? insertCommentTranslationRows(rows)
            : Effect.void,
        })
      }

      const persistCommentProjection = (input: {
        commentId: CommentId
        currentCrdtFrontier: LoroDocFrontier
        moderationStatus: CommentRow["moderationStatus"]
        ownerProfileId: CommentRow["ownerProfileId"]
        parentCommentId: CommentRow["parentCommentId"]
        publicationId: CommentRow["publicationId"]
        sourceData: SourceCommentData
      }) =>
        Effect.gen(function* () {
          yield* persistCommentProjectionRow({
            commentId: input.commentId,
            currentCrdtFrontier: input.currentCrdtFrontier,
            moderationStatus: input.moderationStatus,
            ownerProfileId: input.ownerProfileId,
            parentCommentId: input.parentCommentId,
            publicationId: input.publicationId,
          })

          yield* persistTranslationProjections({
            commentId: input.commentId,
            locales: input.sourceData.locales,
          })
        })

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
          const created = yield* CommentCrdt.create(input.sourceData)

          yield* persistCrdtDocumentCreation({
            insertCrdt: insertCommentCrdtRow(
              CommentCrdtRow.make({
                createdAt: now,
                crdtSnapshot: created.crdtSnapshot,
                id: commentId,
                moderationStatus: "APPROVED_BY_DEFAULT",
                ownerProfileId: input.ownerProfileId,
                parentCommentId: input.parentCommentId,
                publicationId: input.publicationId,
                updatedAt: now,
              }),
            ),
            insertCommitOrRevision: insertCommentCommit({
              commentId,
              commit: HumanCommit.make({
                personId: input.createdById,
              }),
              crdtUpdate: created.initialCrdtUpdate,
              fromCrdtFrontier: EMPTY_LORO_DOC_FRONTIER,
            }),
            persistProjection: persistCommentProjection({
              commentId,
              currentCrdtFrontier: created.currentCrdtFrontier,
              moderationStatus: "APPROVED_BY_DEFAULT",
              ownerProfileId: input.ownerProfileId,
              parentCommentId: input.parentCommentId,
              publicationId: input.publicationId,
              sourceData: created.data,
            }),
          })

          return commentId
        })

      const updateComment = (input: UpdateCommentInput) =>
        Effect.gen(function* () {
          const current = yield* findCommentCrdtSnapshotById(input.commentId).pipe(
            Effect.flatMap(
              Option.match({
                onNone: () =>
                  Effect.fail(
                    new CommentNotFoundError({
                      id: input.commentId,
                    }),
                  ),
                onSome: Effect.succeed,
              }),
            ),
          )

          const commentRow = yield* findCommentRowById(input.commentId).pipe(
            Effect.flatMap(
              Option.match({
                onNone: () =>
                  Effect.fail(
                    new CommentNotFoundError({
                      id: input.commentId,
                    }),
                  ),
                onSome: Effect.succeed,
              }),
            ),
          )

          if (!Equal.equals(commentRow.currentCrdtFrontier, input.expectedCurrentCrdtFrontier)) {
            return yield* new CommentConcurrentUpdateError({
              id: input.commentId,
            })
          }

          const commit: CrdtCommit = Predicate.isTagged(input, "HumanCrdtUpdate")
            ? HumanCommit.make({
                personId: input.authorId,
              })
            : input.commit

          const evolved = yield* Predicate.isTagged(input, "HumanCrdtUpdate")
            ? CommentCrdt.applyUpdate({
                commit,
                crdtUpdate: input.crdtUpdate,
                snapshot: current.crdtSnapshot,
              })
            : CommentCrdt.evolve({
                commit,
                snapshot: current.crdtSnapshot,
                edits: [
                  {
                    _tag: "SetCommentLocale",
                    locale: input.targetLocale,
                    value: {
                      content: input.translatedContent,
                      originalLocale: input.sourceLocale,
                      translatedAtCrdtFrontier: input.expectedCurrentCrdtFrontier,
                      translationSource: "AUTOMATIC",
                    },
                  },
                ],
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
              commit,
              crdtUpdate: evolved.crdtUpdate,
              fromCrdtFrontier: evolved.fromCrdtFrontier,
            }),
            persistProjection: persistCommentProjection({
              commentId: input.commentId,
              currentCrdtFrontier: evolved.nextCrdtFrontier,
              moderationStatus: commentRow.moderationStatus,
              ownerProfileId: commentRow.ownerProfileId,
              parentCommentId: commentRow.parentCommentId,
              publicationId: commentRow.publicationId,
              sourceData: evolved.data,
            }),
          })
        })

      return {
        censorComment,
        createComment,
        deleteComment,
        findCommentContentByIdAndLocale,
        findCommentRowById,
        listCommentCommitRowsByCommentIdAsc,
        listCommentRowsByPublicationId,
        updateComment,
      } as const
    }),
  },
) {}
