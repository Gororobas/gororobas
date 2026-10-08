import { Schema } from "effect"
import { HttpApiEndpoint, HttpApiGroup } from "effect/http-api"

import { UnauthorizedError } from "../authorization/session.js"
import { PublicationCommentId, PublicationId } from "../common/ids.js"
import { PublicationNotFoundError } from "../publications/errors.js"
import {
  ApiUpdatePublicationCommentData,
  PublicationCommentData,
  PublicationCommentSearchParams,
  CreatePublicationCommentData,
} from "./domain.js"
import {
  PublicationCommentConcurrentUpdateError,
  PublicationCommentNotFoundError,
} from "./errors.js"

export class PublicationCommentsApiGroup extends HttpApiGroup.make("publicationComments")
  .add(
    HttpApiEndpoint.get("getPublicationComments", "/publication-comments", {
      success: Schema.Array(PublicationCommentData),
      query: PublicationCommentSearchParams,
      error: [PublicationNotFoundError, UnauthorizedError],
    }),
  )
  .add(
    HttpApiEndpoint.get("getPublicationComment", "/publication-comments/:id", {
      success: PublicationCommentData,
      error: [PublicationCommentNotFoundError, PublicationNotFoundError, UnauthorizedError],
      params: Schema.Struct({ id: PublicationCommentId }),
    }),
  )
  .add(
    HttpApiEndpoint.post("createPublicationComment", "/publications/:id/comments", {
      success: PublicationCommentData,
      error: [PublicationCommentNotFoundError, PublicationNotFoundError, UnauthorizedError],
      params: Schema.Struct({ id: PublicationId }),
      payload: CreatePublicationCommentData,
    }),
  )
  .add(
    HttpApiEndpoint.post("createReplyPublicationComment", "/publication-comments/:id/replies", {
      success: PublicationCommentData,
      error: [PublicationCommentNotFoundError, PublicationNotFoundError, UnauthorizedError],
      params: Schema.Struct({ id: PublicationCommentId }),
      payload: CreatePublicationCommentData,
    }),
  )
  .add(
    HttpApiEndpoint.patch("updatePublicationComment", "/publication-comments/:id", {
      success: PublicationCommentData,
      error: [
        PublicationCommentNotFoundError,
        PublicationCommentConcurrentUpdateError,
        UnauthorizedError,
      ],
      params: Schema.Struct({ id: PublicationCommentId }),
      payload: ApiUpdatePublicationCommentData,
    }),
  )
  .add(
    HttpApiEndpoint.delete("deletePublicationComment", "/publication-comments/:id", {
      success: Schema.Void,
      error: [PublicationCommentNotFoundError, PublicationNotFoundError, UnauthorizedError],
      params: Schema.Struct({ id: PublicationCommentId }),
    }),
  )
  .add(
    HttpApiEndpoint.post("censorPublicationComment", "/publication-comments/:id/censor", {
      success: PublicationCommentData,
      error: [PublicationCommentNotFoundError, PublicationNotFoundError, UnauthorizedError],
      params: Schema.Struct({ id: PublicationCommentId }),
      payload: Schema.Struct({
        reason: Schema.optional(Schema.Trimmed.check(Schema.isNonEmpty())),
      }),
    }),
  ) {}
