import {
  assertAuthenticated,
  PublicationCommentId,
  PublicationCommentNotFoundError,
  Policies,
  PublicationId,
  PublicationNotFoundError,
  SourcePublicationCommentData,
  type ApiUpdatePublicationCommentData,
  UpdatePublicationCommentInput,
} from "@gororobas/domain"
import { DateTime, Effect, Option, Context } from "effect"

import { PublicationsRepository } from "../publications/repository.js"
import { assertCanViewPublication } from "../publications/service.js"
import { PublicationCommentsRepository } from "./repository.js"

export class PublicationCommentsService extends Context.Service<PublicationCommentsService>()(
  "PublicationCommentsService",
  {
    make: Effect.gen(function* () {
      const publicationCommentsRepository = yield* PublicationCommentsRepository
      const publicationsRepository = yield* PublicationsRepository

      const getPublicationCommentById = (publicationCommentId: PublicationCommentId) =>
        publicationCommentsRepository.findPublicationCommentRowById(publicationCommentId).pipe(
          Effect.flatMap(
            Option.match({
              onNone: () =>
                Effect.fail(new PublicationCommentNotFoundError({ id: publicationCommentId })),
              onSome: Effect.succeed,
            }),
          ),
        )

      const getPublicationById = (publicationId: PublicationId) =>
        publicationsRepository.findPublicationRowById(publicationId).pipe(
          Effect.flatMap(
            Option.match({
              onNone: () => Effect.fail(new PublicationNotFoundError({ id: publicationId })),
              onSome: Effect.succeed,
            }),
          ),
        )

      const createPublicationComment = (input: {
        content: SourcePublicationCommentData
        publicationId: PublicationId
      }) =>
        Effect.gen(function* () {
          const session = yield* assertAuthenticated
          yield* Policies.publicationComments.canCreate

          const publication = yield* getPublicationById(input.publicationId)
          yield* assertCanViewPublication(publication)

          return yield* publicationCommentsRepository.createPublicationComment({
            createdById: session.personId,
            ownerProfileId: session.personId,
            parentPublicationCommentId: null,
            publicationId: input.publicationId,
            sourceData: input.content,
          })
        })

      const createReplyPublicationComment = (input: {
        content: SourcePublicationCommentData
        parentPublicationCommentId: PublicationCommentId
      }) =>
        Effect.gen(function* () {
          const session = yield* assertAuthenticated

          yield* Policies.publicationComments.canCreate

          const parent = yield* getPublicationCommentData(input.parentPublicationCommentId)
          yield* assertCanViewPublication(yield* getPublicationById(parent.publicationId))

          return yield* publicationCommentsRepository.createPublicationComment({
            createdById: session.personId,
            ownerProfileId: session.personId,
            parentPublicationCommentId: input.parentPublicationCommentId,
            publicationId: parent.publicationId,
            sourceData: input.content,
          })
        })

      const updatePublicationComment = (
        input: ApiUpdatePublicationCommentData & { publicationCommentId: PublicationCommentId },
      ) =>
        Effect.gen(function* () {
          const row = yield* getPublicationCommentById(input.publicationCommentId)
          const session = yield* Policies.publicationComments.canEdit(row.ownerProfileId)

          yield* publicationCommentsRepository.updatePublicationComment(
            UpdatePublicationCommentInput.make({
              authorId: session.personId,
              publicationCommentId: input.publicationCommentId,
              sourceContent: input.sourceContent,
              expectedCurrentRevisionId: input.expectedCurrentRevisionId,
            }),
          )
        })

      const deletePublicationComment = (publicationCommentId: PublicationCommentId) =>
        Effect.gen(function* () {
          const row = yield* getPublicationCommentById(publicationCommentId)

          yield* Policies.publicationComments.canDelete(row.ownerProfileId)

          yield* publicationCommentsRepository.deletePublicationComment(publicationCommentId)
        })

      const censorPublicationComment = (publicationCommentId: PublicationCommentId) =>
        Effect.gen(function* () {
          yield* getPublicationCommentById(publicationCommentId)
          yield* Policies.publicationComments.canCensor
          yield* publicationCommentsRepository.censorPublicationComment({
            id: publicationCommentId,
            updatedAt: yield* DateTime.now,
          })
        })

      const getPublicationCommentData = (publicationCommentId: PublicationCommentId) =>
        Effect.gen(function* () {
          const publicationComment = yield* getPublicationCommentById(publicationCommentId)
          yield* assertCanViewPublication(
            yield* getPublicationById(publicationComment.publicationId),
          )

          if (publicationComment.moderationStatus === "CENSORED") {
            return yield* new PublicationCommentNotFoundError({ id: publicationCommentId })
          }

          return publicationComment
        })

      const listByPublicationId = (publicationId: PublicationId) =>
        Effect.gen(function* () {
          yield* assertCanViewPublication(yield* getPublicationById(publicationId))

          return (yield* publicationCommentsRepository.listPublicationCommentRowsByPublicationId(
            publicationId,
          )).filter((publicationComment) => publicationComment.moderationStatus !== "CENSORED")
        })

      return {
        censorPublicationComment,
        createPublicationComment,
        createReplyPublicationComment,
        deletePublicationComment,
        getPublicationCommentById,
        getPublicationCommentData,
        listByPublicationId,
        updatePublicationComment,
      } as const
    }),
  },
) {}
