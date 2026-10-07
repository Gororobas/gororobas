import {
  assertAuthenticated,
  CommentId,
  CommentNotFoundError,
  Policies,
  PublicationId,
  PublicationNotFoundError,
  SourceCommentData,
} from "@gororobas/domain"
import { DateTime, Effect, Option, Context } from "effect"

import { PublicationsRepository } from "../publications/repository.js"
import { assertCanViewPublication } from "../publications/service.js"
import { HumanCrdtUpdate } from "./comment-repository-inputs.js"
import { CommentsRepository } from "./repository.js"

export class CommentsService extends Context.Service<CommentsService>()("CommentsService", {
  make: Effect.gen(function* () {
    const commentsRepository = yield* CommentsRepository
    const publicationsRepository = yield* PublicationsRepository

    const getCommentById = (commentId: CommentId) =>
      commentsRepository.findCommentRowById(commentId).pipe(
        Effect.flatMap(
          Option.match({
            onNone: () => Effect.fail(new CommentNotFoundError({ id: commentId })),
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
      content: SourceCommentData
      publicationId: PublicationId
    }) =>
      Effect.gen(function* () {
        const session = yield* assertAuthenticated
        const publication = yield* getPublicationById(input.publicationId)

        yield* Policies.comments.canCreate
        yield* assertCanViewPublication(publication)

        return yield* commentsRepository.createComment({
          createdById: session.personId,
          ownerProfileId: session.personId,
          parentCommentId: null,
          publicationId: input.publicationId,
          sourceData: input.content,
        })
      })

    const createReplyComment = (input: {
      content: SourceCommentData
      parentCommentId: CommentId
    }) =>
      Effect.gen(function* () {
        const session = yield* assertAuthenticated
        const parent = yield* getCommentById(input.parentCommentId)

        yield* Policies.comments.canCreate

        yield* assertCanViewPublication(yield* getPublicationById(parent.publicationId))

        return yield* commentsRepository.createComment({
          createdById: session.personId,
          ownerProfileId: session.personId,
          parentCommentId: input.parentCommentId,
          publicationId: parent.publicationId,
          sourceData: input.content,
        })
      })

    const updateComment = (input: {
      commentId: CommentId
      crdtUpdate: HumanCrdtUpdate["crdtUpdate"]
      expectedCurrentCrdtFrontier: HumanCrdtUpdate["expectedCurrentCrdtFrontier"]
    }) =>
      Effect.gen(function* () {
        const row = yield* getCommentById(input.commentId)
        const session = yield* Policies.comments.canEdit(row.ownerProfileId)

        yield* commentsRepository.updateComment(
          HumanCrdtUpdate.make({
            authorId: session.personId,
            commentId: input.commentId,
            crdtUpdate: input.crdtUpdate,
            expectedCurrentCrdtFrontier: input.expectedCurrentCrdtFrontier,
          }),
        )
      })

    const deleteComment = (commentId: CommentId) =>
      Effect.gen(function* () {
        const row = yield* getCommentById(commentId)

        yield* Policies.comments.canDelete(row.ownerProfileId)

        yield* commentsRepository.deleteComment(commentId)
      })

    const censorComment = (commentId: CommentId) =>
      Effect.gen(function* () {
        yield* getCommentById(commentId)
        yield* Policies.comments.canCensor
        yield* commentsRepository.censorComment({ id: commentId, updatedAt: yield* DateTime.now })
      })

    const listByPublicationId = (publicationId: PublicationId) =>
      Effect.gen(function* () {
        yield* assertCanViewPublication(yield* getPublicationById(publicationId))
        return (yield* commentsRepository.listCommentRowsByPublicationId(publicationId)).filter(
          (comment) => comment.moderationStatus !== "CENSORED",
        )
      })

    return {
      censorComment,
      createPublicationComment,
      createReplyComment,
      deleteComment,
      getCommentById,
      listByPublicationId,
      updateComment,
    } as const
  }),
}) {}
