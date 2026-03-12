/**
 * Post domain entity and related types.
 */
import { Schema } from "effect"

import { PostClassification } from "../classification/domain.js"
import {
  EventAttendanceMode,
  InformationVisibility,
  Locale,
  PostKind,
  TranslationSource,
} from "../common/enums.js"
import { PersonId, PostCommitId, PostId, ProfileId, TagId, VegetableId } from "../common/ids.js"
import { Handle, PaginationOptions, TimestampColumn, TimestampedStruct } from "../common/primitives.js"
import { CrdtCommit, LoroDocFrontier, LoroDocSnapshot, LoroDocUpdate } from "../crdts/domain.js"
import { TiptapDocument } from "../rich-text/domain.js"

export const CorePostMetadata = Schema.Struct({
  handle: Handle,
  ownerProfileId: ProfileId,
  publishedAt: TimestampColumn,
  visibility: InformationVisibility,
})
export type CorePostMetadata = typeof CorePostMetadata.Type

const PostLocalizedDataCommonFields = {
  content: TiptapDocument,
  originalLocale: Locale,
}

const NoteKind = Schema.Literal("NOTE" satisfies (typeof PostKind.literals)[0])
const EventKind = Schema.Literal("EVENT" satisfies (typeof PostKind.literals)[1])

const OriginalPostLocalizedData = Schema.Struct({
  ...PostLocalizedDataCommonFields,
  translationSource: Schema.Literal("ORIGINAL" satisfies (typeof TranslationSource.literals)[0]),
  translatedAtCrdtFrontier: Schema.Null,
})

const TranslatedPostLocalizedData = Schema.Struct({
  ...PostLocalizedDataCommonFields,
  translationSource: Schema.Literals([
    "AUTOMATIC" satisfies (typeof TranslationSource.literals)[1],
    "MANUAL" satisfies (typeof TranslationSource.literals)[2],
  ]),
  translatedAtCrdtFrontier: LoroDocFrontier,
})

export const PostLocalizedData = Schema.Union([
  OriginalPostLocalizedData,
  TranslatedPostLocalizedData,
])
export type PostLocalizedData = typeof PostLocalizedData.Type

export const EventMetadata = Schema.Struct({
  ...CorePostMetadata.fields,
  kind: EventKind,
  startDate: TimestampColumn,
  endDate: Schema.NullOr(TimestampColumn),
  locationOrUrl: Schema.NullOr(Schema.String),
  attendanceMode: Schema.NullOr(EventAttendanceMode),
})
export type EventMetadata = typeof EventMetadata.Type

export const NoteMetadata = Schema.Struct({
  ...CorePostMetadata.fields,
  kind: NoteKind,
})
export type NoteMetadata = typeof NoteMetadata.Type

const PostSourceLocales = Schema.Struct({
  en: Schema.optional(PostLocalizedData),
  es: Schema.optional(PostLocalizedData),
  pt: Schema.optional(PostLocalizedData),
})

/** Data stored in Loro CRDT documents, the source of what gets materialized in the database */
export const NoteSourceData = Schema.Struct({
  locales: PostSourceLocales,
  metadata: NoteMetadata,
})
export type NoteSourceData = typeof NoteSourceData.Type

/** Data stored in Loro CRDT documents, the source of what gets materialized in the database */
export const EventSourceData = Schema.Struct({
  locales: PostSourceLocales,
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

const MatchedTagsAsJson = Schema.fromJsonString(Schema.Array(MatchedTag))
const MatchedVegetablesAsJson = Schema.fromJsonString(Schema.Array(MatchedVegetable))

const PostPageDataCommonFields = {
  ...CorePostMetadata.fields,
  content: Schema.NullOr(Schema.fromJsonString(TiptapDocument)),
  currentCrdtFrontier: Schema.fromJsonString(LoroDocFrontier),
  id: PostId,
  locale: Schema.NullOr(Locale),
  originalLocale: Schema.NullOr(Locale),
  tags: MatchedTagsAsJson,
  updatedAt: TimestampColumn,
  vegetables: MatchedVegetablesAsJson,
}

const PostPageNoteData = Schema.Struct({
  ...PostPageDataCommonFields,
  ...NoteMetadata.fields,
})

const PostPageEventData = Schema.Struct({
  ...PostPageDataCommonFields,
  ...EventMetadata.fields,
})

export const PostPageData = Schema.Union([PostPageNoteData, PostPageEventData])
export type PostPageData = typeof PostPageData.Type

/** API contract schemas (snake_case). */
export const ApiPostSearchParams = Schema.Struct({
  owner_profile_id: Schema.optional(ProfileId),
  type: Schema.optional(PostKind),
  visibility: Schema.optional(InformationVisibility),
  ...PaginationOptions.fields,
})

export const ApiGetPostPageParams = Schema.Struct({
  handle: Handle,
  locale: Locale,
})
export type ApiGetPostPageParams = typeof ApiGetPostPageParams.Type

export const ApiPostCardData = Schema.Struct({
  handle: Handle,
  id: PostId,
  owner_profile_id: ProfileId,
  published_at: Schema.NullOr(TimestampColumn),
  kind: PostKind,
  visibility: InformationVisibility,
})
export type ApiPostCardData = typeof ApiPostCardData.Type

export const ApiNoteData = Schema.Struct({
  content: Schema.fromJsonString(TiptapDocument),
  created_at: TimestampColumn,
  handle: Handle,
  id: PostId,
  locale: Locale,
  owner_profile_id: ProfileId,
  published_at: Schema.NullOr(TimestampColumn),
  kind: NoteKind,
  updated_at: TimestampColumn,
  visibility: InformationVisibility,
})
export type ApiNoteData = typeof ApiNoteData.Type

export const ApiEventData = Schema.Struct({
  attendance_mode: Schema.NullOr(EventAttendanceMode),
  content: Schema.fromJsonString(TiptapDocument),
  created_at: TimestampColumn,
  end_date: Schema.NullOr(TimestampColumn),
  handle: Handle,
  id: PostId,
  locale: Locale,
  location_or_url: Schema.NullOr(Schema.String),
  owner_profile_id: ProfileId,
  published_at: Schema.NullOr(TimestampColumn),
  start_date: TimestampColumn,
  kind: EventKind,
  updated_at: TimestampColumn,
  visibility: InformationVisibility,
})
export type ApiEventData = typeof ApiEventData.Type

export const ApiPostData = Schema.Union([ApiNoteData, ApiEventData])
export type ApiPostData = typeof ApiPostData.Type

export const ApiCreateNoteData = Schema.Struct({
  content: TiptapDocument,
  handle: Handle,
  visibility: InformationVisibility,
})
export type ApiCreateNoteData = typeof ApiCreateNoteData.Type

export const ApiCreateEventData = Schema.Struct({
  attendance_mode: Schema.optional(Schema.NullOr(EventAttendanceMode)),
  content: TiptapDocument,
  end_date: Schema.optional(Schema.NullOr(TimestampColumn)),
  handle: Handle,
  location_or_url: Schema.optional(Schema.NullOr(Schema.String)),
  start_date: TimestampColumn,
  visibility: InformationVisibility,
})
export type ApiCreateEventData = typeof ApiCreateEventData.Type

export const ApiUpdateNoteData = Schema.Struct({
  content: TiptapDocument,
})
export type ApiUpdateNoteData = typeof ApiUpdateNoteData.Type

export const ApiPostHistoryEntry = Schema.Struct({
  author_id: ProfileId,
  content: TiptapDocument,
  created_at: TimestampColumn,
  version: Schema.Int,
})
export type ApiPostHistoryEntry = typeof ApiPostHistoryEntry.Type

export const CreateNoteData = Schema.Struct({
  locale: Locale,
  content: TiptapDocument,
  visibility: InformationVisibility,
})
export type CreateNoteData = typeof CreateNoteData.Type

export const CreateEventData = Schema.Struct({
  locale: Locale,
  attendanceMode: Schema.optional(Schema.NullOr(EventAttendanceMode)),
  content: TiptapDocument,
  endDate: Schema.optional(Schema.NullOr(TimestampColumn)),
  locationOrUrl: Schema.optional(Schema.NullOr(Schema.String)),
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
  classification: Schema.NullOr(Schema.fromJsonString(PostClassification)),
  id: PostId,
  crdtSnapshot: LoroDocSnapshot,
  ownerProfileId: ProfileId,
})
export type PostCrdtRow = typeof PostCrdtRow.Type

export const PostCommitRow = Schema.Struct({
  ...TimestampedStruct.fields,
  id: PostCommitId,
  postId: PostId,
  createdById: Schema.NullOr(PersonId),
  crdtUpdate: LoroDocUpdate,
  fromCrdtFrontier: Schema.fromJsonString(LoroDocFrontier),
})
export type PostCommitRow = typeof PostCommitRow.Type

export const PostRow = Schema.Struct({
  ...TimestampedStruct.fields,
  currentCrdtFrontier: Schema.fromJsonString(LoroDocFrontier),
  handle: Handle,
  id: PostId,
  ownerProfileId: ProfileId,
  publishedAt: TimestampColumn,
  kind: PostKind,
  visibility: InformationVisibility,

  // Event-specific - always `null` for notes
  startDate: Schema.NullOr(TimestampColumn),
  endDate: Schema.NullOr(TimestampColumn),
  locationOrUrl: Schema.NullOr(Schema.String),
  attendanceMode: Schema.NullOr(EventAttendanceMode),
})
export type PostRow = typeof PostRow.Type

export const PostTranslationRow = Schema.Struct({
  content: Schema.fromJsonString(TiptapDocument),
  contentPlainText: Schema.String,
  locale: Locale,
  originalLocale: Locale,
  postId: PostId,
  translatedAtCrdtFrontier: Schema.fromJsonString(Schema.NullOr(LoroDocFrontier)),
  translationSource: TranslationSource,
})
export type PostTranslationRow = typeof PostTranslationRow.Type

export const PostTagRow = Schema.Struct({
  extractionText: Schema.NullOr(Schema.String),
  postId: PostId,
  tagId: TagId,
})
export type PostTagRow = typeof PostTagRow.Type

export const PostVegetableRow = Schema.Struct({
  extractionText: Schema.NullOr(Schema.String),
  postId: PostId,
  vegetableId: VegetableId,
})
export type PostVegetableRow = typeof PostVegetableRow.Type
