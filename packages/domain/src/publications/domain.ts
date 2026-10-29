/**
 * Publication domain entity and related types.
 */
import { Schema } from "effect"

import { ContentLanguage } from "../common/content-language.js"
import {
  EventAttendanceMode,
  ModerationStatus,
  SupportedLanguage,
  PublicationKind,
  PublicationVisibility,
  TranslationSource,
} from "../common/enums.js"
import {
  MediaAssetId,
  PersonId,
  PublicationRevisionId,
  PublicationId,
  ProfileId,
  WikiArticleId,
} from "../common/ids.js"
import {
  Handle,
  NonEmptyTrimmedString,
  PaginationOptions,
  TimestampColumn,
  TimestampedStruct,
} from "../common/primitives.js"
import { SourceContent, SourceContentFields, TranslatedContent } from "../common/source-content.js"
import { CrdtCommit, LoroDocFrontier, LoroDocSnapshot, LoroDocUpdate } from "../crdts/domain.js"
import { LinkInferenceRun, makeLink, makeLinkRow } from "../links/domain.js"
import { MediaAssetRow } from "../media-assets/domain.js"
import { ProfileCardData } from "../profiles/domain.js"
import { TiptapDocument } from "../rich-text/domain.js"
import { WikiArticleQueriedCardData } from "../wiki/wiki-article.js"

/**
 * Kept on `publication_sources`, outside the CRDT: ownership, routing and access control can't
 * change through a collaborative edit. Visibility changes through its own field of the update.
 */
export const CorePublicationMetadata = Schema.Struct({
  handle: Handle,
  ownerProfileId: ProfileId,
  publishedAt: TimestampColumn,
  visibility: PublicationVisibility,
})

export type CorePublicationMetadata = typeof CorePublicationMetadata.Type

const PostKind = Schema.Literal("POST" satisfies (typeof PublicationKind.literals)[0])
const EventKind = Schema.Literal("EVENT" satisfies (typeof PublicationKind.literals)[1])

export const PublicationLocalizedData = TranslatedContent
export type PublicationLocalizedData = typeof PublicationLocalizedData.Type

export const EventMetadata = Schema.Struct({
  kind: EventKind,
  startDate: TimestampColumn,
  endDate: Schema.NullOr(TimestampColumn),
  locationOrUrl: Schema.NullOr(Schema.String),
  attendanceMode: Schema.NullOr(EventAttendanceMode),
})

export type EventMetadata = typeof EventMetadata.Type

export const PostMetadata = Schema.Struct({
  kind: PostKind,
})
export type PostMetadata = typeof PostMetadata.Type

/** Data stored in Loro CRDT documents, the source of the persisted database projections */
export const PostSourceData = Schema.Struct({
  ...SourceContentFields,
  metadata: PostMetadata,
}).check(
  Schema.makeFilter((data) => Schema.is(SourceContent)(data), {
    identifier: "PublicationSourceContent",
    title: "Publication source content",
    description: "Valid source content and original aliases.",
  }),
)

export type PostSourceData = typeof PostSourceData.Type

/** Data stored in Loro CRDT documents, the source of the persisted database projections */
export const EventSourceData = Schema.Struct({
  ...SourceContentFields,
  metadata: EventMetadata,
}).check(
  Schema.makeFilter((data) => Schema.is(SourceContent)(data), {
    identifier: "PublicationSourceContent",
    title: "Publication source content",
    description: "Valid source content and original aliases.",
  }),
)

export type EventSourceData = typeof EventSourceData.Type

/** Data stored in Loro CRDT documents, the source of the persisted database projections */
export const PublicationSourceData = Schema.Union([PostSourceData, EventSourceData])
export type PublicationSourceData = typeof PublicationSourceData.Type

export const PublicationWikiArticleLink = makeLink({ wikiArticleId: WikiArticleId }).pipe(
  Schema.toTaggedUnion("source"),
)
export type PublicationWikiArticleLink = typeof PublicationWikiArticleLink.Type

const PublicationPageDataCommonFields = {
  ...CorePublicationMetadata.fields,
  content: Schema.NullOr(Schema.fromJsonString(TiptapDocument)),
  currentCrdtFrontier: Schema.fromJsonString(LoroDocFrontier),
  id: PublicationId,
  language: Schema.NullOr(ContentLanguage),
  originalLanguage: Schema.NullOr(ContentLanguage),
  updatedAt: TimestampColumn,
  wikiArticles: Schema.fromJsonString(Schema.Array(PublicationWikiArticleLink)),
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
  text: Schema.optional(NonEmptyTrimmedString),
  ownerProfileId: Schema.optional(ProfileId),
  kind: Schema.optional(PublicationKind),
  visibility: Schema.optional(PublicationVisibility),
  /** Only publications linked to this wiki article, through any link source. */
  wikiArticleId: Schema.optional(WikiArticleId),
  /** Preferred language for each card's content. */
  language: Schema.optional(SupportedLanguage),
  ...PaginationOptions.fields,
})

export const ApiGetPublicationPageParams = Schema.Struct({
  handle: Handle,
  language: SupportedLanguage,
})
export type ApiGetPublicationPageParams = typeof ApiGetPublicationPageParams.Type

export const ApiPublicationCardData = Schema.Struct({
  handle: Handle,
  id: PublicationId,
  ownerProfileId: ProfileId,
  owner: ProfileCardData,
  publishedAt: Schema.NullOr(TimestampColumn),
  kind: PublicationKind,
  visibility: PublicationVisibility,
  /** The translation that best matches the requested language. */
  content: TiptapDocument,
  language: ContentLanguage,
  originalLanguage: ContentLanguage,
  mediaAssets: Schema.Array(MediaAssetRow),
  /** CONCEPT articles the publication is about, shown as its themes. */
  concepts: Schema.Array(WikiArticleQueriedCardData),
})

export type ApiPublicationCardData = typeof ApiPublicationCardData.Type

export const ApiPostResponse = Schema.Struct({
  mediaAssets: Schema.optional(Schema.Array(MediaAssetRow)),
  content: Schema.fromJsonString(TiptapDocument),
  createdAt: TimestampColumn,
  currentCrdtFrontier: Schema.fromJsonString(LoroDocFrontier),
  handle: Handle,
  id: PublicationId,
  language: ContentLanguage,
  ownerProfileId: ProfileId,
  publishedAt: Schema.NullOr(TimestampColumn),
  kind: PostKind,
  updatedAt: TimestampColumn,
  visibility: PublicationVisibility,
})

export type ApiPostResponse = typeof ApiPostResponse.Type

export const ApiEventResponse = Schema.Struct({
  mediaAssets: Schema.optional(Schema.Array(MediaAssetRow)),
  attendanceMode: Schema.NullOr(EventAttendanceMode),
  content: Schema.fromJsonString(TiptapDocument),
  createdAt: TimestampColumn,
  currentCrdtFrontier: Schema.fromJsonString(LoroDocFrontier),
  endDate: Schema.NullOr(TimestampColumn),
  handle: Handle,
  id: PublicationId,
  language: ContentLanguage,
  locationOrUrl: Schema.NullOr(Schema.String),
  ownerProfileId: ProfileId,
  publishedAt: Schema.NullOr(TimestampColumn),
  startDate: TimestampColumn,
  kind: EventKind,
  updatedAt: TimestampColumn,
  visibility: PublicationVisibility,
})

export type ApiEventResponse = typeof ApiEventResponse.Type

export const ApiPublicationData = Schema.Union([ApiPostResponse, ApiEventResponse])
export type ApiPublicationData = typeof ApiPublicationData.Type

const ApiCreatePostData = Schema.Struct({
  kind: PostKind,
  sourceLanguage: Schema.optional(ContentLanguage),
  mediaIds: Schema.optional(Schema.Array(MediaAssetId)),
  content: TiptapDocument,
  handle: Handle,
  visibility: PublicationVisibility,
})

const ApiCreateEventData = Schema.Struct({
  kind: EventKind,
  sourceLanguage: Schema.optional(ContentLanguage),
  mediaIds: Schema.optional(Schema.Array(MediaAssetId)),
  attendanceMode: Schema.optional(Schema.NullOr(EventAttendanceMode)),
  content: TiptapDocument,
  endDate: Schema.optional(Schema.NullOr(TimestampColumn)),
  handle: Handle,
  locationOrUrl: Schema.optional(Schema.NullOr(Schema.String)),
  startDate: TimestampColumn,
  visibility: PublicationVisibility,
})

export const ApiCreatePublicationData = Schema.Union([ApiCreatePostData, ApiCreateEventData])
export type ApiCreatePublicationData = typeof ApiCreatePublicationData.Type

export const PublicationCrdtEdit = Schema.Struct({
  crdtUpdate: LoroDocUpdate,
  expectedCurrentCrdtFrontier: LoroDocFrontier,
})

export type PublicationCrdtEdit = typeof PublicationCrdtEdit.Type

/** Each field changes its own part of the publication, so clients can send any combination. */
export const ApiUpdatePublicationData = Schema.Struct({
  mediaIds: Schema.optional(Schema.Array(MediaAssetId)),
  crdtEdit: Schema.optional(PublicationCrdtEdit),
  visibility: Schema.optional(PublicationVisibility),
})

export type ApiUpdatePublicationData = typeof ApiUpdatePublicationData.Type

export const ApiPublicationHistoryEntry = Schema.Struct({
  authorId: Schema.NullOr(ProfileId),
  content: TiptapDocument,
  createdAt: TimestampColumn,
  version: Schema.Int,
})

export type ApiPublicationHistoryEntry = typeof ApiPublicationHistoryEntry.Type

export const CreatePostData = Schema.Struct({
  handle: Schema.optional(Handle),
  mediaIds: Schema.optional(Schema.Array(MediaAssetId)),
  sourceLanguage: Schema.optional(ContentLanguage),
  content: TiptapDocument,
  visibility: PublicationVisibility,
})

export type CreatePostData = typeof CreatePostData.Type

export const CreateEventData = Schema.Struct({
  handle: Schema.optional(Handle),
  mediaIds: Schema.optional(Schema.Array(MediaAssetId)),
  sourceLanguage: Schema.optional(ContentLanguage),
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

export const PublicationSourceRow = Schema.Struct({
  ...TimestampedStruct.fields,
  ...CorePublicationMetadata.fields,
  linkInference: Schema.NullOr(Schema.fromJsonString(LinkInferenceRun)),
  id: PublicationId,
  crdtSnapshot: LoroDocSnapshot,
  moderationStatus: ModerationStatus,
})

export type PublicationSourceRow = typeof PublicationSourceRow.Type

export const PublicationRevisionRow = Schema.Struct({
  ...TimestampedStruct.fields,
  id: PublicationRevisionId,
  publicationId: PublicationId,
  createdById: Schema.NullOr(PersonId),
  crdtUpdate: LoroDocUpdate,
  fromCrdtFrontier: Schema.fromJsonString(LoroDocFrontier),
})

export type PublicationRevisionRow = typeof PublicationRevisionRow.Type

/** Projected from the CRDT; `updatedAt` is when the CRDT last changed. */
export const PublicationProjectionRow = Schema.Struct({
  ...TimestampedStruct.fields,
  currentCrdtFrontier: Schema.fromJsonString(LoroDocFrontier),
  id: PublicationId,
  kind: PublicationKind,

  // Event-specific - always `null` for posts
  startDate: Schema.NullOr(TimestampColumn),
  endDate: Schema.NullOr(TimestampColumn),
  locationOrUrl: Schema.NullOr(Schema.String),
  attendanceMode: Schema.NullOr(EventAttendanceMode),
})

export type PublicationProjectionRow = typeof PublicationProjectionRow.Type

/** A publication's projection joined with the core metadata of its source row. */
export const PublicationRow = Schema.Struct({
  ...PublicationProjectionRow.fields,
  ...CorePublicationMetadata.fields,
})

export type PublicationRow = typeof PublicationRow.Type

/** A publication's row with the moderation status kept on its source row. */
export const ModeratedPublicationRow = Schema.Struct({
  ...PublicationRow.fields,
  moderationStatus: ModerationStatus,
})
export type ModeratedPublicationRow = typeof ModeratedPublicationRow.Type

export const PublicationTranslationRow = Schema.Struct({
  content: Schema.fromJsonString(TiptapDocument),
  contentPlainText: Schema.String,
  /** `contentPlainText`, folded with `toSearchableText` for full-text search. */
  searchableContent: Schema.String,
  language: ContentLanguage,
  originalLanguage: ContentLanguage,
  publicationId: PublicationId,
  translatedAtCrdtFrontier: Schema.fromJsonString(Schema.NullOr(LoroDocFrontier)),
  translationSource: TranslationSource,
})

export type PublicationTranslationRow = typeof PublicationTranslationRow.Type

export const PublicationWikiArticleRow = makeLinkRow({
  publicationId: PublicationId,
  wikiArticleId: WikiArticleId,
}).pipe(Schema.toTaggedUnion("source"))

export type PublicationWikiArticleRow = typeof PublicationWikiArticleRow.Type
