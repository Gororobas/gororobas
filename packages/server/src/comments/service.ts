import {
  assertAuthenticated,
  CommentId,
  CommentNotFoundError,
  Policies,
  PostId,
  PostNotFoundError,
  ResourceId,
  SourceCommentData,
} from "@gororobas/domain"
import { Effect, Option, ServiceMap } from "effect"

import { PostsRepository } from "../posts/repository.js"
import { HumanUpdatePtContent } from "./comment-repository-inputs.js"
import { CommentsRepository } from "./repository.js"

export class CommentsService extends ServiceMap.Service<CommentsService>()("CommentsService", {
  make: Effect.gen(function* () {
    const commentsRepository = yield* CommentsRepository
    const postsRepository = yield* PostsRepository

    const getCommentById = (commentId: CommentId) =>
      commentsRepository.findCommentRowById(commentId).pipe(
        Effect.flatMap(
          Option.match({
            onNone: () => Effect.fail(new CommentNotFoundError({ id: commentId })),
            onSome: Effect.succeed,
          }),
        ),
      )

    const getPostById = (postId: PostId) =>
      postsRepository.findPostRowById(postId).pipe(
        Effect.flatMap(
          Option.match({
            onNone: () => Effect.fail(new PostNotFoundError({ id: postId })),
            onSome: Effect.succeed,
          }),
        ),
      )

    const createPostComment = (input: { content: SourceCommentData; postId: PostId }) =>
      Effect.gen(function* () {
        const session = yield* assertAuthenticated
        const post = yield* getPostById(input.postId)

        yield* Policies.comments.canCreate
        yield* Policies.posts.canView(post)

        return yield* commentsRepository.createComment({
          createdById: session.personId,
          ownerProfileId: session.personId,
          parentCommentId: null,
          postId: input.postId,
          resourceId: null,
          sourceData: input.content,
        })
      })

    const createResourceComment = (input: { content: SourceCommentData; resourceId: ResourceId }) =>
      Effect.gen(function* () {
        const session = yield* assertAuthenticated

        yield* Policies.resources.canComment

        return yield* commentsRepository.createComment({
          createdById: session.personId,
          ownerProfileId: session.personId,
          parentCommentId: null,
          postId: null,
          resourceId: input.resourceId,
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

        if (parent.postId !== null) {
          yield* Policies.posts.canView(yield* getPostById(parent.postId))
        }

        return yield* commentsRepository.createComment({
          createdById: session.personId,
          ownerProfileId: session.personId,
          parentCommentId: input.parentCommentId,
          postId: parent.postId,
          resourceId: parent.resourceId,
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
          HumanUpdatePtContent.makeUnsafe({
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
      createPostComment,
      createReplyComment,
      createResourceComment,
      deleteComment,
      getCommentById,
      listByPostId: commentsRepository.listCommentRowsByPostId,
      listByResourceId: commentsRepository.listCommentRowsByResourceId,
      updateComment,
    } as const
  }),
}) {}
