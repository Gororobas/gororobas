/**
 * Comment domain entity and related types.
 */
import { Schema, Struct } from "effect"

import { ContentLanguage } from "../common/content-language.js"
import { ModerationStatus, TranslationSource } from "../common/enums.js"
import { CommentCommitId, CommentId, PersonId, PublicationId, ProfileId } from "../common/ids.js"
import { TimestampColumn, TimestampedStruct } from "../common/primitives.js"
import { SourceContent, TranslatedContent } from "../common/source-content.js"
import { LoroDocFrontier, LoroDocSnapshot, LoroDocUpdate } from "../crdts/domain.js"
import { TiptapDocument } from "../rich-text/domain.js"

export const CommentLocalizedData = TranslatedContent
export type CommentLocalizedData = typeof CommentLocalizedData.Type

export const SourceCommentData = SourceContent
export type SourceCommentData = typeof SourceCommentData.Type

export const CommentCrdtRow = Schema.Struct({
  ...TimestampedStruct.fields,
  id: CommentId,
  crdtSnapshot: LoroDocSnapshot,
  moderationStatus: ModerationStatus,
  ownerProfileId: ProfileId,
  parentCommentId: Schema.NullOr(CommentId),
  publicationId: PublicationId,
})

export type CommentCrdtRow = typeof CommentCrdtRow.Type

export const CommentCommitRow = Schema.Struct({
  createdAt: TimestampColumn,
  createdById: Schema.NullOr(PersonId),
  fromCrdtFrontier: Schema.fromJsonString(LoroDocFrontier),
  id: CommentCommitId,
  commentId: CommentId,
  crdtUpdate: LoroDocUpdate,
})

export type CommentCommitRow = typeof CommentCommitRow.Type

export const CommentRow = Schema.Struct({
  ...Struct.omit(CommentCrdtRow.fields, ["crdtSnapshot"]),
  currentCrdtFrontier: Schema.fromJsonString(LoroDocFrontier),
})

export type CommentRow = typeof CommentRow.Type

export const CommentTranslationRow = Schema.Struct({
  commentId: CommentId,
  content: Schema.fromJsonString(TiptapDocument),
  contentPlainText: Schema.String,
  language: ContentLanguage,
  originalLanguage: ContentLanguage,
  translatedAtCrdtFrontier: Schema.fromJsonString(Schema.NullOr(LoroDocFrontier)),
  translationSource: TranslationSource,
})

export type CommentTranslationRow = typeof CommentTranslationRow.Type

/** API response schemas */
export const CommentData = Schema.Struct({
  ...CommentRow.fields,
  content: Schema.fromJsonString(TiptapDocument),
})

export type CommentData = typeof CommentData.Type

export const CreateCommentData = Schema.Struct({
  content: TiptapDocument,
  parentCommentId: Schema.optional(CommentId),
})
export type CreateCommentData = typeof CreateCommentData.Type

export const ApiUpdateCommentData = Schema.Struct({
  crdtUpdate: LoroDocUpdate,
  expectedCurrentCrdtFrontier: LoroDocFrontier,
})
export type ApiUpdateCommentData = typeof ApiUpdateCommentData.Type

export const CommentSearchParams = Schema.Struct({
  publicationId: Schema.optional(PublicationId),
})
export type CommentSearchParams = typeof CommentSearchParams.Type
