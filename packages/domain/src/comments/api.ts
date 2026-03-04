/**
 * Comments HTTP API endpoints.
 */
import { HttpApiEndpoint, HttpApiGroup } from "@effect/platform"
import { Schema } from "effect"

import { CommentId, PostId, ResourceId } from "../common/ids.js"
import { PostNotFoundError } from "../posts/errors.js"
import { ResourceNotFoundError } from "../resources/errors.js"
import { CommentData, CommentSearchParams, CreateCommentData, UpdateCommentData } from "./domain.js"
import { CommentNotFoundError } from "./errors.js"

export class CommentsApiGroup extends HttpApiGroup.make("comments")
  .add(
    HttpApiEndpoint.get("getComments", "/comments")
      .addSuccess(Schema.Array(CommentData))
      .setUrlParams(CommentSearchParams),
  )
  .add(
    HttpApiEndpoint.get("getComment", "/comments/:id")
      .addSuccess(CommentData)
      .addError(CommentNotFoundError, { status: 404 })
      .setPath(Schema.Struct({ id: CommentId })),
  )
  .add(
    HttpApiEndpoint.post("createPostComment", "/posts/:id/comments")
      .addSuccess(CommentData)
      .addError(PostNotFoundError, { status: 404 })
      .setPath(Schema.Struct({ id: PostId }))
      .setPayload(CreateCommentData),
  )
  .add(
    HttpApiEndpoint.post("createResourceComment", "/resources/:id/comments")
      .addSuccess(CommentData)
      .addError(ResourceNotFoundError, { status: 404 })
      .setPath(Schema.Struct({ id: ResourceId }))
      .setPayload(CreateCommentData),
  )
  .add(
    HttpApiEndpoint.post("createReplyComment", "/comments/:id/replies")
      .addSuccess(CommentData)
      .addError(CommentNotFoundError, { status: 404 })
      .setPath(Schema.Struct({ id: CommentId }))
      .setPayload(CreateCommentData),
  )
  .add(
    HttpApiEndpoint.patch("updateComment", "/comments/:id")
      .addSuccess(CommentData)
      .addError(CommentNotFoundError, { status: 404 })
      .setPath(Schema.Struct({ id: CommentId }))
      .setPayload(UpdateCommentData),
  )
  .add(
    HttpApiEndpoint.del("deleteComment", "/comments/:id")
      .addSuccess(Schema.Void)
      .addError(CommentNotFoundError, { status: 404 })
      .setPath(Schema.Struct({ id: CommentId })),
  )
  .add(
    HttpApiEndpoint.post("censorComment", "/comments/:id/censor")
      .addSuccess(CommentData)
      .addError(CommentNotFoundError, { status: 404 })
      .setPath(Schema.Struct({ id: CommentId }))
      .setPayload(Schema.Struct({ reason: Schema.optional(Schema.NonEmptyTrimmedString) })),
  ) {}
