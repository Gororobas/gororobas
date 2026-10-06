/**
 * Publication domain entity and related types.
 */
import { Schema } from "effect"

import { PublicationClassification } from "../classification/domain.js"
import {
  EventAttendanceMode,
  Locale,
  PublicationKind,
  PublicationVisibility,
  TranslationSource,
} from "../common/enums.js"
import {
  PersonId,
  PublicationCommitId,
  PublicationId,
  ProfileId,
  TagId,
  WikiArticleId,
} from "../common/ids.js"
import {
  Handle,
  PaginationOptions,
  TimestampColumn,
  TimestampedStruct,
} from "../common/primitives.js"
import { CrdtCommit, LoroDocFrontier, LoroDocSnapshot, LoroDocUpdate } from "../crdts/domain.js"
import { TiptapDocument } from "../rich-text/domain.js"

export const CorePublicationMetadata = Schema.Struct({
  handle: Handle,
  ownerProfileId: ProfileId,
  publishedAt: TimestampColumn,
  visibility: PublicationVisibility,
})

export type CorePublicationMetadata = typeof CorePublicationMetadata.Type

const PublicationLocalizedDataCommonFields = {
  content: TiptapDocument,
  originalLocale: Locale,
}

const PostKind = Schema.Literal("POST" satisfies (typeof PublicationKind.literals)[0])
const EventKind = Schema.Literal("EVENT" satisfies (typeof PublicationKind.literals)[1])

const OriginalPublicationLocalizedData = Schema.Struct({
  ...PublicationLocalizedDataCommonFields,
  translationSource: Schema.Literal("ORIGINAL" satisfies (typeof TranslationSource.literals)[0]),
  translatedAtCrdtFrontier: Schema.Null,
})

const TranslatedPublicationLocalizedData = Schema.Struct({
  ...PublicationLocalizedDataCommonFields,
  translationSource: Schema.Literals([
    "AUTOMATIC" satisfies (typeof TranslationSource.literals)[1],
    "MANUAL" satisfies (typeof TranslationSource.literals)[2],
  ]),
  translatedAtCrdtFrontier: LoroDocFrontier,
})

export const PublicationLocalizedData = Schema.Union([
  OriginalPublicationLocalizedData,
  TranslatedPublicationLocalizedData,
])
export type PublicationLocalizedData = typeof PublicationLocalizedData.Type

export const EventMetadata = Schema.Struct({
  ...CorePublicationMetadata.fields,
  kind: EventKind,
  startDate: TimestampColumn,
  endDate: Schema.NullOr(TimestampColumn),
  locationOrUrl: Schema.NullOr(Schema.String),
  attendanceMode: Schema.NullOr(EventAttendanceMode),
})

export type EventMetadata = typeof EventMetadata.Type

export const PostMetadata = Schema.Struct({
  ...CorePublicationMetadata.fields,
  kind: PostKind,
})
export type PostMetadata = typeof PostMetadata.Type

const PublicationSourceLocales = Schema.Struct({
  en: Schema.optional(PublicationLocalizedData),
  es: Schema.optional(PublicationLocalizedData),
  pt: Schema.optional(PublicationLocalizedData),
})

/** Data stored in Loro CRDT documents, the source of what gets materialized in the database */
export const PostSourceData = Schema.Struct({
  locales: PublicationSourceLocales,
  metadata: PostMetadata,
})
export type PostSourceData = typeof PostSourceData.Type

/** Data stored in Loro CRDT documents, the source of what gets materialized in the database */
export const EventSourceData = Schema.Struct({
  locales: PublicationSourceLocales,
  metadata: EventMetadata,
})
export type EventSourceData = typeof EventSourceData.Type

/** Data stored in Loro CRDT documents, the source of what gets materialized in the database */
export const PublicationSourceData = Schema.Union([PostSourceData, EventSourceData])
export type PublicationSourceData = typeof PublicationSourceData.Type

const MatchedTag = Schema.Struct({
  tag_id: Schema.String,
  extraction_text: Schema.NullOr(Schema.String),
})

const MatchedWikiArticle = Schema.Struct({
  wiki_article_id: WikiArticleId,
  extraction_text: Schema.NullOr(Schema.String),
})

const MatchedTagsAsJson = Schema.fromJsonString(Schema.Array(MatchedTag))
const MatchedWikiArticlesAsJson = Schema.fromJsonString(Schema.Array(MatchedWikiArticle))

const PublicationPageDataCommonFields = {
  ...CorePublicationMetadata.fields,
  content: Schema.NullOr(Schema.fromJsonString(TiptapDocument)),
  currentCrdtFrontier: Schema.fromJsonString(LoroDocFrontier),
  id: PublicationId,
  locale: Schema.NullOr(Locale),
  originalLocale: Schema.NullOr(Locale),
  tags: MatchedTagsAsJson,
  updatedAt: TimestampColumn,
  wikiArticles: MatchedWikiArticlesAsJson,
}

const PublicationPagePostData = Schema.Struct({
  ...PublicationPageDataCommonFields,
  ...PostMetadata.fields,
})

const PublicationPageEventData = Schema.Struct({
  ...PublicationPageDataCommonFields,
  ...EventMetadata.fields,
})

export const PublicationPageData = Schema.Union([PublicationPagePostData, PublicationPageEventData])
export type PublicationPageData = typeof PublicationPageData.Type

/** API contract schemas (camelCase). */
export const ApiPublicationSearchParams = Schema.Struct({
  ownerProfileId: Schema.optional(ProfileId),
  type: Schema.optional(PublicationKind),
  visibility: Schema.optional(PublicationVisibility),
  ...PaginationOptions.fields,
})

export const ApiGetPublicationPageParams = Schema.Struct({
  handle: Handle,
  locale: Locale,
})
export type ApiGetPublicationPageParams = typeof ApiGetPublicationPageParams.Type

export const ApiPublicationCardData = Schema.Struct({
  handle: Handle,
  id: PublicationId,
  ownerProfileId: ProfileId,
  publishedAt: Schema.NullOr(TimestampColumn),
  kind: PublicationKind,
  visibility: PublicationVisibility,
})

export type ApiPublicationCardData = typeof ApiPublicationCardData.Type

export const ApiPostData = Schema.Struct({
  content: Schema.fromJsonString(TiptapDocument),
  createdAt: TimestampColumn,
  currentCrdtFrontier: Schema.fromJsonString(LoroDocFrontier),
  handle: Handle,
  id: PublicationId,
  locale: Locale,
  ownerProfileId: ProfileId,
  publishedAt: Schema.NullOr(TimestampColumn),
  kind: PostKind,
  updatedAt: TimestampColumn,
  visibility: PublicationVisibility,
})

export type ApiPostData = typeof ApiPostData.Type

export const ApiEventData = Schema.Struct({
  attendanceMode: Schema.NullOr(EventAttendanceMode),
  content: Schema.fromJsonString(TiptapDocument),
  createdAt: TimestampColumn,
  currentCrdtFrontier: Schema.fromJsonString(LoroDocFrontier),
  endDate: Schema.NullOr(TimestampColumn),
  handle: Handle,
  id: PublicationId,
  locale: Locale,
  locationOrUrl: Schema.NullOr(Schema.String),
  ownerProfileId: ProfileId,
  publishedAt: Schema.NullOr(TimestampColumn),
  startDate: TimestampColumn,
  kind: EventKind,
  updatedAt: TimestampColumn,
  visibility: PublicationVisibility,
})

export type ApiEventData = typeof ApiEventData.Type

export const ApiPublicationData = Schema.Union([ApiPostData, ApiEventData])
export type ApiPublicationData = typeof ApiPublicationData.Type

export const ApiCreatePostData = Schema.Struct({
  content: TiptapDocument,
  handle: Handle,
  visibility: PublicationVisibility,
})

export type ApiCreatePostData = typeof ApiCreatePostData.Type

export const ApiCreateEventData = Schema.Struct({
  attendanceMode: Schema.optional(Schema.NullOr(EventAttendanceMode)),
  content: TiptapDocument,
  endDate: Schema.optional(Schema.NullOr(TimestampColumn)),
  handle: Handle,
  locationOrUrl: Schema.optional(Schema.NullOr(Schema.String)),
  startDate: TimestampColumn,
  visibility: PublicationVisibility,
})

export type ApiCreateEventData = typeof ApiCreateEventData.Type

export const ApiUpdatePostData = Schema.Struct({
  crdtUpdate: LoroDocUpdate,
  expectedCurrentCrdtFrontier: LoroDocFrontier,
})
export type ApiUpdatePostData = typeof ApiUpdatePostData.Type

export const ApiPublicationHistoryEntry = Schema.Struct({
  authorId: ProfileId,
  content: TiptapDocument,
  createdAt: TimestampColumn,
  version: Schema.Int,
})

export type ApiPublicationHistoryEntry = typeof ApiPublicationHistoryEntry.Type

export const CreatePostData = Schema.Struct({
  locale: Locale,
  content: TiptapDocument,
  visibility: PublicationVisibility,
})

export type CreatePostData = typeof CreatePostData.Type

export const CreateEventData = Schema.Struct({
  locale: Locale,
  attendanceMode: Schema.optional(Schema.NullOr(EventAttendanceMode)),
  content: TiptapDocument,
  endDate: Schema.optional(Schema.NullOr(TimestampColumn)),
  locationOrUrl: Schema.optional(Schema.NullOr(Schema.String)),
  startDate: TimestampColumn,
  visibility: PublicationVisibility,
})

export type CreateEventData = typeof CreateEventData.Type

export const PublicationHistoryEntry = Schema.Struct({
  author: CrdtCommit,
  content: TiptapDocument,
  createdAt: TimestampColumn,
  version: Schema.Int,
})

export type PublicationHistoryEntry = typeof PublicationHistoryEntry.Type

export const PublicationCrdtRow = Schema.Struct({
  ...TimestampedStruct.fields,
  classification: Schema.NullOr(Schema.fromJsonString(PublicationClassification)),
  id: PublicationId,
  crdtSnapshot: LoroDocSnapshot,
  ownerProfileId: ProfileId,
})

export type PublicationCrdtRow = typeof PublicationCrdtRow.Type

export const PublicationCommitRow = Schema.Struct({
  ...TimestampedStruct.fields,
  id: PublicationCommitId,
  publicationId: PublicationId,
  createdById: Schema.NullOr(PersonId),
  crdtUpdate: LoroDocUpdate,
  fromCrdtFrontier: Schema.fromJsonString(LoroDocFrontier),
})

export type PublicationCommitRow = typeof PublicationCommitRow.Type

export const PublicationRow = Schema.Struct({
  ...TimestampedStruct.fields,
  currentCrdtFrontier: Schema.fromJsonString(LoroDocFrontier),
  handle: Handle,
  id: PublicationId,
  ownerProfileId: ProfileId,
  publishedAt: TimestampColumn,
  kind: PublicationKind,
  visibility: PublicationVisibility,

  // Event-specific - always `null` for posts
  startDate: Schema.NullOr(TimestampColumn),
  endDate: Schema.NullOr(TimestampColumn),
  locationOrUrl: Schema.NullOr(Schema.String),
  attendanceMode: Schema.NullOr(EventAttendanceMode),
})

export type PublicationRow = typeof PublicationRow.Type

export const PublicationTranslationRow = Schema.Struct({
  content: Schema.fromJsonString(TiptapDocument),
  contentPlainText: Schema.String,
  locale: Locale,
  originalLocale: Locale,
  publicationId: PublicationId,
  translatedAtCrdtFrontier: Schema.fromJsonString(Schema.NullOr(LoroDocFrontier)),
  translationSource: TranslationSource,
})

export type PublicationTranslationRow = typeof PublicationTranslationRow.Type

export const PublicationTagRow = Schema.Struct({
  extractionText: Schema.NullOr(Schema.String),
  publicationId: PublicationId,
  tagId: TagId,
})

export type PublicationTagRow = typeof PublicationTagRow.Type

export const PublicationWikiArticleRow = Schema.Struct({
  extractionText: Schema.NullOr(Schema.String),
  publicationId: PublicationId,
  wikiArticleId: WikiArticleId,
})

export type PublicationWikiArticleRow = typeof PublicationWikiArticleRow.Type
