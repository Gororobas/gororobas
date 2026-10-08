import {
  ContentLanguage,
  PublicationCommentContentRevisionId,
  PublicationCommentConcurrentUpdateError,
  PublicationCommentId,
  PublicationCommentNotFoundError,
  IdGen,
  tiptapToText,
  TiptapDocument,
  type CreatePublicationCommentInput,
  type UpdatePublicationCommentInput,
  type UpdatePublicationCommentLanguageInput,
  type UpsertPublicationCommentTranslationsInput,
} from "@gororobas/domain"
import { Context, DateTime, Effect, Option, Schema } from "effect"
import { SqlClient } from "effect/sql"

import {
  deletePublicationComment,
  censorPublicationComment,
  insertPublicationCommentContentRevisionRow,
  insertPublicationCommentRow,
  updatePublicationCommentRow,
  updatePublicationCommentLanguage,
  upsertPublicationCommentTranslationRow,
} from "./mutations.js"
import {
  findPublicationCommentContentByIdAndLanguage,
  findPublicationCommentRowById,
  listPublicationCommentContentRevisionRowsByPublicationCommentIdAsc,
  listPublicationCommentTranslationRowsByPublicationCommentId,
  listPublicationCommentRowsByPublicationId,
} from "./queries.js"

export class PublicationCommentsRepository extends Context.Service<PublicationCommentsRepository>()(
  "PublicationCommentsRepository",
  {
    make: Effect.gen(function* () {
      const sql = yield* SqlClient.SqlClient

      const contentEquals = Schema.toEquivalence(TiptapDocument)

      const getPublicationComment = (id: PublicationCommentId) =>
        findPublicationCommentRowById(id).pipe(
          Effect.flatMap(
            Option.match({
              onNone: () => Effect.fail(new PublicationCommentNotFoundError({ id })),
              onSome: Effect.succeed,
            }),
          ),
        )

      const createPublicationComment = (input: CreatePublicationCommentInput) =>
        sql.withTransaction(
          Effect.gen(function* () {
            const id = yield* IdGen.make(PublicationCommentId)
            const revisionId = yield* IdGen.make(PublicationCommentContentRevisionId)
            const now = yield* DateTime.now

            yield* insertPublicationCommentRow({
              id,
              createdAt: now,
              updatedAt: now,
              moderationStatus: "APPROVED_BY_DEFAULT",
              ownerProfileId: input.ownerProfileId,
              parentPublicationCommentId: input.parentPublicationCommentId,
              publicationId: input.publicationId,
              ...input.sourceData,
            })

            yield* insertPublicationCommentContentRevisionRow({
              id: revisionId,
              publicationCommentId: id,
              createdById: input.createdById,
              createdAt: now,
            })

            return id
          }),
        )

      const updatePublicationComment = (input: UpdatePublicationCommentInput) =>
        sql.withTransaction(
          Effect.gen(function* () {
            const row = yield* getPublicationComment(input.publicationCommentId)

            if (row.currentRevisionId !== input.expectedCurrentRevisionId) {
              return yield* new PublicationCommentConcurrentUpdateError({
                id: input.publicationCommentId,
              })
            }

            if (contentEquals(row.sourceContent, input.sourceContent)) {
              return
            }

            const revisionId = yield* IdGen.make(PublicationCommentContentRevisionId)
            const now = yield* DateTime.now

            yield* insertPublicationCommentContentRevisionRow({
              id: revisionId,
              publicationCommentId: input.publicationCommentId,
              createdById: input.authorId,
              createdAt: now,
            })

            yield* updatePublicationCommentRow({
              id: input.publicationCommentId,
              sourceContent: input.sourceContent,
              sourceLanguage: ContentLanguage.make("und"),
              updatedAt: now,
            })

            // Old translations can retain text the author removed, so we delete it for privacy.
            yield* sql`DELETE FROM publication_comment_translations WHERE publication_comment_id = ${input.publicationCommentId}`
          }),
        )

      const assertRevision = (
        publicationCommentId: PublicationCommentId,
        sourceRevisionId: PublicationCommentContentRevisionId,
      ) =>
        getPublicationComment(publicationCommentId).pipe(
          Effect.flatMap((row) =>
            row.currentRevisionId === sourceRevisionId
              ? Effect.succeed(row)
              : Effect.fail(
                  new PublicationCommentConcurrentUpdateError({ id: publicationCommentId }),
                ),
          ),
        )

      const setPublicationCommentSourceLanguage = (input: UpdatePublicationCommentLanguageInput) =>
        sql.withTransaction(
          Effect.gen(function* () {
            const row = yield* assertRevision(input.publicationCommentId, input.sourceRevisionId)

            if (row.sourceLanguage !== input.sourceLanguage) {
              yield* updatePublicationCommentLanguage({
                id: input.publicationCommentId,
                sourceLanguage: input.sourceLanguage,
              })
              yield* sql`DELETE FROM publication_comment_translations WHERE publication_comment_id = ${input.publicationCommentId}`
            }

            return yield* listPublicationCommentTranslationRowsByPublicationCommentId(
              input.publicationCommentId,
            )
          }),
        )

      const upsertPublicationCommentTranslations = (
        input: UpsertPublicationCommentTranslationsInput,
      ) =>
        sql.withTransaction(
          Effect.gen(function* () {
            yield* assertRevision(input.publicationCommentId, input.sourceRevisionId)

            yield* Effect.forEach(
              input.translations,
              (translation) =>
                upsertPublicationCommentTranslationRow({
                  publicationCommentId: input.publicationCommentId,
                  content: translation.content,
                  contentPlainText: tiptapToText(translation.content),
                  language: ContentLanguage.make(translation.language),
                  translatedAtRevisionId: input.sourceRevisionId,
                }),
              { discard: true, concurrency: 1 },
            )
          }),
        )

      return {
        censorPublicationComment,
        createPublicationComment,
        deletePublicationComment,
        findPublicationCommentContentByIdAndLanguage,
        findPublicationCommentRowById,
        listPublicationCommentContentRevisionRowsByPublicationCommentIdAsc,
        listPublicationCommentRowsByPublicationId,
        updatePublicationComment,
        upsertPublicationCommentTranslations,
        setPublicationCommentSourceLanguage,
      } as const
    }),
  },
) {}
