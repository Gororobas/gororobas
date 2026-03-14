/**
 * Comment domain entity and related types.
 */
import { Schema } from "effect"

import { Locale, ModerationStatus, TranslationSource } from "../common/enums.js"
import {
  CommentCommitId,
  CommentId,
  PersonId,
  PostId,
  ProfileId,
  ResourceId,
} from "../common/ids.js"
import { TimestampColumn, TimestampedStruct } from "../common/primitives.js"
import { LoroDocFrontier, LoroDocSnapshot, LoroDocUpdate } from "../crdts/domain.js"
import { TiptapDocument } from "../rich-text/domain.js"

const CommentLocalizedDataCommonFields = {
  content: TiptapDocument,
  originalLocale: Locale,
}

const OriginalCommentLocalizedData = Schema.Struct({
  ...CommentLocalizedDataCommonFields,
  translationSource: Schema.Literal("ORIGINAL" satisfies (typeof TranslationSource.literals)[0]),
  translatedAtCrdtFrontier: Schema.Null,
})

const TranslatedCommentLocalizedData = Schema.Struct({
  ...CommentLocalizedDataCommonFields,
  translationSource: Schema.Literals([
    "AUTOMATIC" satisfies (typeof TranslationSource.literals)[1],
    "MANUAL" satisfies (typeof TranslationSource.literals)[2],
  ]),
  translatedAtCrdtFrontier: LoroDocFrontier,
})

export const CommentLocalizedData = Schema.Union([
  OriginalCommentLocalizedData,
  TranslatedCommentLocalizedData,
])
export type CommentLocalizedData = typeof CommentLocalizedData.Type

const CommentSourceLocales = Schema.Struct({
  en: Schema.optional(CommentLocalizedData),
  es: Schema.optional(CommentLocalizedData),
  pt: Schema.optional(CommentLocalizedData),
})

export const SourceCommentData = Schema.Struct({
  locales: CommentSourceLocales,
})
export type SourceCommentData = typeof SourceCommentData.Type

export const CommentCrdtRow = Schema.Struct({
  ...TimestampedStruct.fields,
  id: CommentId,
  crdtSnapshot: LoroDocSnapshot,
  moderationStatus: Schema.NullOr(ModerationStatus),
  ownerProfileId: ProfileId,
  parentCommentId: Schema.NullOr(CommentId),
  postId: Schema.NullOr(PostId),
  resourceId: Schema.NullOr(ResourceId),
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
  ...TimestampedStruct.fields,
  currentCrdtFrontier: Schema.fromJsonString(LoroDocFrontier),
  id: CommentId,
  moderationStatus: Schema.NullOr(ModerationStatus),
  ownerProfileId: ProfileId,
  parentCommentId: Schema.NullOr(CommentId),
  postId: Schema.NullOr(PostId),
  resourceId: Schema.NullOr(ResourceId),
})
export type CommentRow = typeof CommentRow.Type

export const CommentTranslationRow = Schema.Struct({
  commentId: CommentId,
  content: Schema.fromJsonString(TiptapDocument),
  contentPlainText: Schema.String,
  locale: Locale,
  originalLocale: Locale,
  translatedAtCrdtFrontier: Schema.fromJsonString(Schema.NullOr(LoroDocFrontier)),
  translationSource: TranslationSource,
})
export type CommentTranslationRow = typeof CommentTranslationRow.Type

/** API response schemas */
export const CommentData = Schema.Struct({
  content: Schema.fromJsonString(TiptapDocument),
  createdAt: TimestampColumn,
  id: CommentId,
  moderationStatus: Schema.NullOr(ModerationStatus),
  ownerProfileId: ProfileId,
  parentCommentId: Schema.NullOr(CommentId),
  postId: Schema.NullOr(PostId),
  resourceId: Schema.NullOr(ResourceId),
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
  expectedCurrentCrdtFrontier: LoroDocFrontier,
})
export type UpdateCommentData = typeof UpdateCommentData.Type

export const ApiUpdateCommentData = Schema.Struct({
  content: TiptapDocument,
  expectedCurrentCrdtFrontier: LoroDocFrontier,
})
export type ApiUpdateCommentData = typeof ApiUpdateCommentData.Type

export const CommentSearchParams = Schema.Struct({
  postId: Schema.optional(PostId),
  resourceId: Schema.optional(ResourceId),
})
export type CommentSearchParams = typeof CommentSearchParams.Type
