import { Schema } from "effect"
/**
 * Comments HTTP API endpoints.
 */
import { HttpApiEndpoint, HttpApiGroup } from "effect/unstable/httpapi"

import { CommentId, PublicationId, ResourceId } from "../common/ids.js"
import { PublicationNotFoundError } from "../publications/errors.js"
import { ResourceNotFoundError } from "../resources/errors.js"
import {
  ApiUpdateCommentData,
  CommentData,
  CommentSearchParams,
  CreateCommentData,
} from "./domain.js"
import { CommentConcurrentUpdateError, CommentNotFoundError } from "./errors.js"

export class CommentsApiGroup extends HttpApiGroup.make("comments")
  .add(
    HttpApiEndpoint.get("getComments", "/comments", {
      success: Schema.Array(CommentData),
      query: CommentSearchParams,
    }),
  )
  .add(
    HttpApiEndpoint.get("getComment", "/comments/:id", {
      success: CommentData,
      error: CommentNotFoundError,
      params: Schema.Struct({ id: CommentId }),
    }),
  )
  .add(
    HttpApiEndpoint.post("createPublicationComment", "/publications/:id/comments", {
      success: CommentData,
      error: PublicationNotFoundError,
      params: Schema.Struct({ id: PublicationId }),
      payload: CreateCommentData,
    }),
  )
  .add(
    HttpApiEndpoint.post("createResourceComment", "/resources/:id/comments", {
      success: CommentData,
      error: ResourceNotFoundError,
      params: Schema.Struct({ id: ResourceId }),
      payload: CreateCommentData,
    }),
  )
  .add(
    HttpApiEndpoint.post("createReplyComment", "/comments/:id/replies", {
      success: CommentData,
      error: CommentNotFoundError,
      params: Schema.Struct({ id: CommentId }),
      payload: CreateCommentData,
    }),
  )
  .add(
    HttpApiEndpoint.patch("updateComment", "/comments/:id", {
      success: CommentData,
      error: Schema.Union([CommentNotFoundError, CommentConcurrentUpdateError]),
      params: Schema.Struct({ id: CommentId }),
      payload: ApiUpdateCommentData,
    }),
  )
  .add(
    HttpApiEndpoint.delete("deleteComment", "/comments/:id", {
      success: Schema.Void,
      error: CommentNotFoundError,
      params: Schema.Struct({ id: CommentId }),
    }),
  )
  .add(
    HttpApiEndpoint.post("censorComment", "/comments/:id/censor", {
      success: CommentData,
      error: CommentNotFoundError,
      params: Schema.Struct({ id: CommentId }),
      payload: Schema.Struct({
        reason: Schema.optional(Schema.Trimmed.check(Schema.isNonEmpty())),
      }),
    }),
  ) {}
