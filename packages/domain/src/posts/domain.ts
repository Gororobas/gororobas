/**
 * Post domain entity and related types.
 */
import { Schema } from "effect"

import {
  EventAttendanceMode,
  InformationVisibility,
  Locale,
  PostKind,
  TranslationSource,
} from "../common/enums.js"
import { PersonId, PostCommitId, PostId, ProfileId, TagId, VegetableId } from "../common/ids.js"
import { Handle, TimestampColumn, TimestampedStruct } from "../common/primitives.js"
import { LoroDocUpdate, LoroDocSnapshot, LoroDocFrontier } from "../crdts/domain.js"
import { CrdtCommit } from "../crdts/domain.js"
import { TiptapDocument } from "../rich-text/domain.js"

export const CorePostMetadata = Schema.Struct({
  handle: Handle,
  ownerProfileId: ProfileId,
  publishedAt: Schema.NullishOr(TimestampColumn),
  visibility: InformationVisibility,
})
export type CorePostMetadata = typeof CorePostMetadata.Type

export const PostLocalizedData = Schema.Struct({
  content: TiptapDocument,
  originalLocale: Locale,
  translationSource: TranslationSource,
})
export type PostLocalizedData = typeof PostLocalizedData.Type

export const EventMetadata = Schema.Struct({
  ...CorePostMetadata.fields,
  kind: Schema.Literal("EVENT" satisfies (typeof PostKind.literals)[1]),
  startDate: TimestampColumn,
  endDate: Schema.NullishOr(TimestampColumn),
  locationOrUrl: Schema.NullishOr(Schema.String),
  attendanceMode: Schema.NullishOr(EventAttendanceMode),
})
export type EventMetadata = typeof EventMetadata.Type

export const NoteMetadata = Schema.Struct({
  ...CorePostMetadata.fields,
  kind: Schema.Literal("NOTE" satisfies (typeof PostKind.literals)[0]),
})
export type NoteMetadata = typeof NoteMetadata.Type

/** Data stored in Loro CRDT documents, the source of what gets materialized in the database */
export const NoteSourceData = Schema.Struct({
  locales: Schema.Struct({
    en: Schema.optional(PostLocalizedData),
    es: Schema.optional(PostLocalizedData),
    pt: Schema.optional(PostLocalizedData),
  }),
  metadata: NoteMetadata,
})
export type NoteSourceData = typeof NoteSourceData.Type

/** Data stored in Loro CRDT documents, the source of what gets materialized in the database */
export const EventSourceData = Schema.Struct({
  locales: Schema.Struct({
    en: Schema.optional(PostLocalizedData),
    es: Schema.optional(PostLocalizedData),
    pt: Schema.optional(PostLocalizedData),
  }),
  metadata: EventMetadata,
})
export type EventSourceData = typeof EventSourceData.Type

/** Data stored in Loro CRDT documents, the source of what gets materialized in the database */
export const SourcePostData = Schema.Union([NoteSourceData, EventSourceData])
export type SourcePostData = typeof SourcePostData.Type

const MatchedTag = Schema.Struct({
  tag_id: Schema.String,
  extraction_text: Schema.NullOr(Schema.String),
})

const MatchedVegetable = Schema.Struct({
  vegetable_id: Schema.String,
  extraction_text: Schema.NullOr(Schema.String),
})

const CoreQueriedPostData = Schema.Struct({
  locale: Locale,
  tags: Schema.fromJsonString(Schema.Array(MatchedTag)),
  vegetables: Schema.fromJsonString(Schema.Array(MatchedVegetable)),
  ...PostLocalizedData.fields,
})

export const QueriedNoteData = Schema.Struct({
  ...CoreQueriedPostData.fields,
  ...NoteMetadata.fields,
})
export type QueriedNoteData = typeof QueriedNoteData.Type

export const QueriedEventData = Schema.Struct({
  ...CoreQueriedPostData.fields,
  ...EventMetadata.fields,
})
export type QueriedEventData = typeof QueriedEventData.Type

export const QueriedPostData = Schema.Union([QueriedNoteData, QueriedEventData])
export type QueriedPostData = typeof QueriedPostData.Type

/** API response schemas */
export const PostSearchParams = Schema.Struct({
  ownerProfileId: Schema.optional(ProfileId),
  page: Schema.NumberFromString,
  type: Schema.optional(PostKind),
  visibility: Schema.optional(InformationVisibility),
})
export type PostSearchParams = typeof PostSearchParams.Type

export const PostCardData = Schema.Struct({
  handle: Handle,
  id: PostId,
  ownerProfileId: ProfileId,
  publishedAt: Schema.NullishOr(TimestampColumn),
  kind: PostKind,
  visibility: InformationVisibility,
})
export type PostCardData = typeof PostCardData.Type

export const NoteData = Schema.Struct({
  content: Schema.fromJsonString(TiptapDocument),
  createdAt: TimestampColumn,
  handle: Handle,
  id: PostId,
  locale: Locale,
  ownerProfileId: ProfileId,
  publishedAt: Schema.NullishOr(TimestampColumn),
  kind: Schema.Literal("NOTE" satisfies (typeof PostKind.literals)[0]),
  updatedAt: TimestampColumn,
  visibility: InformationVisibility,
})
export type NoteData = typeof NoteData.Type

export const EventData = Schema.Struct({
  attendanceMode: Schema.NullishOr(EventAttendanceMode),
  content: Schema.fromJsonString(TiptapDocument),
  createdAt: TimestampColumn,
  endDate: Schema.NullishOr(TimestampColumn),
  handle: Handle,
  id: PostId,
  locale: Locale,
  locationOrUrl: Schema.NullishOr(Schema.String),
  ownerProfileId: ProfileId,
  publishedAt: Schema.NullishOr(TimestampColumn),
  startDate: TimestampColumn,
  kind: Schema.Literal("EVENT" satisfies (typeof PostKind.literals)[1]),
  updatedAt: TimestampColumn,
  visibility: InformationVisibility,
})
export type EventData = typeof EventData.Type

export const PostData = Schema.Union([NoteData, EventData])
export type PostData = typeof PostData.Type

export const CreateNoteData = Schema.Struct({
  content: TiptapDocument,
  handle: Handle,
  visibility: InformationVisibility,
})
export type CreateNoteData = typeof CreateNoteData.Type

export const CreateEventData = Schema.Struct({
  attendanceMode: Schema.optional(Schema.NullishOr(EventAttendanceMode)),
  content: TiptapDocument,
  endDate: Schema.optional(Schema.NullishOr(TimestampColumn)),
  handle: Handle,
  locationOrUrl: Schema.optional(Schema.NullishOr(Schema.String)),
  startDate: TimestampColumn,
  visibility: InformationVisibility,
})
export type CreateEventData = typeof CreateEventData.Type

export const UpdateNoteData = Schema.Struct({
  content: TiptapDocument,
})
export type UpdateNoteData = typeof UpdateNoteData.Type

export const PostHistoryEntry = Schema.Struct({
  author: CrdtCommit,
  content: TiptapDocument,
  createdAt: TimestampColumn,
  version: Schema.Int,
})
export type PostHistoryEntry = typeof PostHistoryEntry.Type

export const PostCrdtRow = Schema.Struct({
  ...TimestampedStruct.fields,
  classification: Schema.NullishOr(Schema.fromJsonString(Schema.Unknown)),
  id: PostId,
  loroCrdt: LoroDocSnapshot,
  ownerProfileId: ProfileId,
})
export type PostCrdtRow = typeof PostCrdtRow.Type

export const AiTranslationMetadata = Schema.Struct({
  model: Schema.String,
  workflowName: Schema.String,
  workflowVersion: Schema.String,
})
export type AiTranslationMetadata = typeof AiTranslationMetadata.Type

export const PostCommitRow = Schema.Struct({
  ...TimestampedStruct.fields,
  id: PostCommitId,
  postId: PostId,
  createdById: Schema.NullishOr(PersonId),
  crdtUpdate: LoroDocUpdate,
  fromCrdtFrontier: Schema.fromJsonString(LoroDocFrontier),
})
export type PostCommitRow = typeof PostCommitRow.Type

export const PostRow = Schema.Struct({
  ...TimestampedStruct.fields,
  attendanceMode: Schema.NullishOr(EventAttendanceMode),
  currentCrdtFrontier: Schema.fromJsonString(LoroDocFrontier),
  endDate: Schema.NullishOr(TimestampColumn),
  handle: Handle,
  id: PostId,
  locationOrUrl: Schema.NullishOr(Schema.String),
  ownerProfileId: ProfileId,
  publishedAt: Schema.NullishOr(TimestampColumn),
  startDate: Schema.NullishOr(TimestampColumn),
  kind: PostKind,
  visibility: Schema.NullishOr(InformationVisibility),
})
export type PostRow = typeof PostRow.Type

export const PostTranslationRow = Schema.Struct({
  content: Schema.fromJsonString(TiptapDocument),
  contentPlainText: Schema.String,
  locale: Locale,
  originalLocale: Locale,
  postId: PostId,
  translatedAtCrdtFrontier: Schema.fromJsonString(LoroDocFrontier),
  translationSource: TranslationSource,
})
export type PostTranslationRow = typeof PostTranslationRow.Type

export const PostTagRow = Schema.Struct({
  extractionText: Schema.NullishOr(Schema.String),
  postId: PostId,
  tagId: TagId,
})
export type PostTagRow = typeof PostTagRow.Type

export const PostVegetableRow = Schema.Struct({
  extractionText: Schema.NullishOr(Schema.String),
  postId: PostId,
  vegetableId: VegetableId,
})
export type PostVegetableRow = typeof PostVegetableRow.Type
