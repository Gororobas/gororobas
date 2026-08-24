import {
  assertAuthenticated,
  CommentId,
  CommentNotFoundError,
  Policies,
  PublicationId,
  PublicationNotFoundError,
  SourceCommentData,
} from "@gororobas/domain"
import { Effect, Option, Context } from "effect"

import { PublicationsRepository } from "../publications/repository.js"
import { HumanUpdatePtContent } from "./comment-repository-inputs.js"
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
        yield* Policies.publications.canView(publication)

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

        yield* Policies.publications.canView(yield* getPublicationById(parent.publicationId))

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
      content: HumanUpdatePtContent["content"]
      expectedCurrentCrdtFrontier: HumanUpdatePtContent["expectedCurrentCrdtFrontier"]
    }) =>
      Effect.gen(function* () {
        const row = yield* getCommentById(input.commentId)
        const session = yield* Policies.comments.canEdit(row.ownerProfileId)

        yield* commentsRepository.updateComment(
          HumanUpdatePtContent.make({
            authorId: session.personId,
            commentId: input.commentId,
            content: input.content,
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
      })

    return {
      censorComment,
      createPublicationComment,
      createReplyComment,
      deleteComment,
      getCommentById,
      listByPublicationId: commentsRepository.listCommentRowsByPublicationId,
      updateComment,
    } as const
  }),
}) {}
