import { Schema } from "effect"

import { ContentLanguage } from "../common/content-language.js"
import { ModerationStatus, SupportedLanguage } from "../common/enums.js"
import {
  PublicationCommentContentRevisionId,
  PublicationCommentId,
  PersonId,
  PublicationId,
  ProfileId,
} from "../common/ids.js"
import { TimestampColumn, TimestampedStruct } from "../common/primitives.js"
import { TiptapDocument } from "../rich-text/domain.js"

export const SourcePublicationCommentData = Schema.Struct({
  sourceContent: TiptapDocument,
  sourceLanguage: ContentLanguage,
})
export type SourcePublicationCommentData = typeof SourcePublicationCommentData.Type

export const PublicationCommentContentRevisionRow = Schema.Struct({
  id: PublicationCommentContentRevisionId,
  publicationCommentId: PublicationCommentId,
  createdById: Schema.NullOr(PersonId),
  createdAt: TimestampColumn,
})

export type PublicationCommentContentRevisionRow = typeof PublicationCommentContentRevisionRow.Type

/** Where a comment sits in its thread, which it keeps after being deleted. */
const PublicationCommentPlacement = Schema.Struct({
  ...TimestampedStruct.fields,
  id: PublicationCommentId,
  moderationStatus: ModerationStatus,
  parentPublicationCommentId: Schema.NullOr(PublicationCommentId),
  publicationId: PublicationId,
})

export const ActivePublicationCommentRow = Schema.Struct({
  ...PublicationCommentPlacement.fields,
  deletedAt: Schema.Null,
  ownerProfileId: ProfileId,
  sourceLanguage: ContentLanguage,
  sourceContent: Schema.fromJsonString(TiptapDocument),
})

export type ActivePublicationCommentRow = typeof ActivePublicationCommentRow.Type

/**
 * A deleted comment that other people replied to: it stays in the thread, so their replies keep
 * their place under "This comment has been deleted", without its author or content. Once no reply
 * remains under it, it's removed for good.
 */
export const DeletedPublicationCommentRow = Schema.Struct({
  ...PublicationCommentPlacement.fields,
  deletedAt: TimestampColumn,
  ownerProfileId: Schema.Null,
  sourceLanguage: Schema.Null,
  sourceContent: Schema.Null,
})

export type DeletedPublicationCommentRow = typeof DeletedPublicationCommentRow.Type

export const PublicationCommentRow = Schema.Union([
  ActivePublicationCommentRow,
  DeletedPublicationCommentRow,
])

export type PublicationCommentRow = typeof PublicationCommentRow.Type

export const isDeletedPublicationComment = <Comment extends { readonly deletedAt: unknown }>(
  comment: Comment,
): comment is Extract<Comment, { readonly deletedAt: TimestampColumn }> =>
  comment.deletedAt !== null

export const PublicationCommentTranslationRow = Schema.Struct({
  publicationCommentId: PublicationCommentId,
  content: Schema.fromJsonString(TiptapDocument),
  contentPlainText: Schema.String,
  language: ContentLanguage,
  translatedAtRevisionId: PublicationCommentContentRevisionId,
})

export type PublicationCommentTranslationRow = typeof PublicationCommentTranslationRow.Type

/** API response schemas */
export const ActivePublicationCommentData = Schema.Struct({
  ...ActivePublicationCommentRow.fields,
  currentRevisionId: PublicationCommentContentRevisionId,
  editCount: Schema.Int.check(Schema.isGreaterThanOrEqualTo(0)),
  editedAt: Schema.NullOr(TimestampColumn),
})

export type ActivePublicationCommentData = typeof ActivePublicationCommentData.Type

/** Deleting a comment also deletes its revisions: only its place in the thread remains. */
export const PublicationCommentData = Schema.Union([
  ActivePublicationCommentData,
  DeletedPublicationCommentRow,
])

export type PublicationCommentData = typeof PublicationCommentData.Type

export const CreatePublicationCommentData = Schema.Struct({
  content: TiptapDocument,
})
export type CreatePublicationCommentData = typeof CreatePublicationCommentData.Type

export const ApiUpdatePublicationCommentData = Schema.Struct({
  sourceContent: TiptapDocument,
  expectedCurrentRevisionId: PublicationCommentContentRevisionId,
})
export type ApiUpdatePublicationCommentData = typeof ApiUpdatePublicationCommentData.Type

export const PublicationCommentSearchParams = Schema.Struct({
  publicationId: PublicationId,
})
export type PublicationCommentSearchParams = typeof PublicationCommentSearchParams.Type

export const CreatePublicationCommentInput = Schema.Struct({
  createdById: PersonId,
  ownerProfileId: ProfileId,
  parentPublicationCommentId: Schema.NullOr(PublicationCommentId),
  publicationId: PublicationId,
  sourceData: SourcePublicationCommentData,
})

export type CreatePublicationCommentInput = typeof CreatePublicationCommentInput.Type

export const UpdatePublicationCommentInput = Schema.Struct({
  ...ApiUpdatePublicationCommentData.fields,
  authorId: PersonId,
  publicationCommentId: PublicationCommentId,
})

export type UpdatePublicationCommentInput = typeof UpdatePublicationCommentInput.Type

export const UpdatePublicationCommentLanguageInput = Schema.Struct({
  publicationCommentId: PublicationCommentId,
  sourceRevisionId: PublicationCommentContentRevisionId,
  sourceLanguage: ContentLanguage,
})

export type UpdatePublicationCommentLanguageInput =
  typeof UpdatePublicationCommentLanguageInput.Type

export const PublicationCommentTranslation = Schema.Struct({
  language: SupportedLanguage,
  content: TiptapDocument,
})
export type PublicationCommentTranslation = typeof PublicationCommentTranslation.Type

export const UpsertPublicationCommentTranslationsInput = Schema.Struct({
  publicationCommentId: PublicationCommentId,
  sourceRevisionId: PublicationCommentContentRevisionId,
  translations: Schema.Array(PublicationCommentTranslation),
})

export type UpsertPublicationCommentTranslationsInput =
  typeof UpsertPublicationCommentTranslationsInput.Type
