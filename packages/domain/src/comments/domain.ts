/**
 * Comment domain entity and related types.
 */
import { Schema } from "effect"

import { Locale, ModerationStatus, TranslationSource } from "../common/enums.js"
import { CommentId, PostId, ProfileId, ResourceId } from "../common/ids.js"
import { TimestampColumn } from "../common/primitives.js"
import { TiptapDocument } from "../rich-text/domain.js"

export const Comment = Schema.Struct({
  createdAt: TimestampColumn,
  currentCrdtFrontier: Schema.Unknown,
  id: CommentId,
  moderationStatus: Schema.NullishOr(ModerationStatus),
  ownerProfileId: ProfileId,
  parentCommentId: Schema.NullishOr(CommentId),
  postId: Schema.NullishOr(PostId),
  resourceId: Schema.NullishOr(ResourceId),
  updatedAt: TimestampColumn,
})
export type Comment = typeof Comment.Type

export const CommentTranslation = Schema.Struct({
  commentId: CommentId,
  content: TiptapDocument,
  contentPlainText: Schema.String,
  locale: Locale,
  originalLocale: Locale,
  translatedAtCrdtFrontier: Schema.Unknown,
  translationSource: TranslationSource,
})
export type CommentTranslation = typeof CommentTranslation.Type

/** API response schemas */
export const CommentData = Schema.Struct({
  content: Schema.fromJsonString(TiptapDocument),
  createdAt: TimestampColumn,
  id: CommentId,
  moderationStatus: Schema.NullishOr(ModerationStatus),
  ownerProfileId: ProfileId,
  parentCommentId: Schema.NullishOr(CommentId),
  postId: Schema.NullishOr(PostId),
  resourceId: Schema.NullishOr(ResourceId),
  updatedAt: TimestampColumn,
})
export type CommentData = typeof CommentData.Type

export const CreateCommentData = Schema.Struct({
  content: TiptapDocument,
  parentCommentId: Schema.optional(CommentId),
})
export type CreateCommentData = typeof CreateCommentData.Type

export const UpdateCommentData = Schema.Struct({
  content: TiptapDocument,
})
export type UpdateCommentData = typeof UpdateCommentData.Type

export const CommentSearchParams = Schema.Struct({
  postId: Schema.optional(PostId),
  resourceId: Schema.optional(ResourceId),
})
export type CommentSearchParams = typeof CommentSearchParams.Type
