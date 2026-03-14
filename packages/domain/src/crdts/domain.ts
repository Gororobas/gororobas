import { DateTime, Schema } from "effect"
import { schema as loroSchema } from "loro-mirror"

import {
  EventAttendanceMode,
  InformationVisibility,
  Locale,
  TranslationSource,
} from "../common/enums.js"
import { PersonId, ProfileId } from "../common/ids.js"
import { Handle, TimestampColumn } from "../common/primitives.js"
import { TiptapDocument } from "../rich-text/domain.js"

export const LoroDocUpdate = Schema.Uint8Array.pipe(Schema.brand("LoroCrdtUpdateEncoded"))
export type LoroDocUpdate = typeof LoroDocUpdate.Type

export const LoroDocSnapshot = Schema.Uint8Array.pipe(Schema.brand("LoroDocSnapshotEncoded"))
export type LoroDocSnapshot = typeof LoroDocSnapshot.Type

export const LoroDocFrontier = Schema.Array(
  Schema.Struct({
    peer: Schema.TemplateLiteral([Schema.Number]),
    counter: Schema.Finite,
  }),
).pipe(Schema.brand("LoroDocFrontier"))
export type LoroDocFrontier = typeof LoroDocFrontier.Type

export const HumanCommit = Schema.TaggedStruct("HumanCommit", {
  personId: PersonId,
})
export type HumanCommit = typeof HumanCommit.Type

export const SystemCommit = Schema.TaggedStruct("SystemCommit", {
  workflowName: Schema.String,
  workflowVersion: Schema.String,
  model: Schema.String,
})
export type SystemCommit = typeof SystemCommit.Type

export const CrdtCommit = Schema.Union([HumanCommit, SystemCommit])
export type CrdtCommit = typeof CrdtCommit.Type

export const CrdtCommitEncoded = Schema.fromJsonString(CrdtCommit)

export const PostLocalizedDataLoro = loroSchema.LoroMap(
  {
    content: loroSchema.LoroText(),
    original_locale: loroSchema.String<Locale>(),
    translation_source: loroSchema.String<TranslationSource>(),
  },
  { required: true },
)

export const NoteMetadataLoro = loroSchema.LoroMap({
  handle: loroSchema.String<Handle>({ required: true }),
  kind: loroSchema.String<"NOTE">(),
  owner_profile_id: loroSchema.String<ProfileId>({ required: true }),
  published_at: loroSchema.String(),
  visibility: loroSchema.String<InformationVisibility>({ required: true }),
})

export const EventMetadataLoro = loroSchema.LoroMap({
  attendance_mode: loroSchema.String<EventAttendanceMode>(),
  end_date: loroSchema.String(),
  handle: loroSchema.String<Handle>({ required: true }),
  kind: loroSchema.String<"EVENT">(),
  location_or_url: loroSchema.String(),
  owner_profile_id: loroSchema.String<ProfileId>({ required: true }),
  published_at: loroSchema.String(),
  start_date: loroSchema.String({ required: true }),
  visibility: loroSchema.String<InformationVisibility>({ required: true }),
})

export const NoteSourceDataLoro = loroSchema({
  locales: loroSchema.LoroMap(
    {
      en: PostLocalizedDataLoro,
      es: PostLocalizedDataLoro,
      pt: PostLocalizedDataLoro,
    },
    { required: true },
  ),
  metadata: NoteMetadataLoro,
})

export const EventSourceDataLoro = loroSchema({
  locales: loroSchema.LoroMap(
    {
      en: PostLocalizedDataLoro,
      es: PostLocalizedDataLoro,
      pt: PostLocalizedDataLoro,
    },
    { required: true },
  ),
  metadata: EventMetadataLoro,
})

const PostLocalizedDataStorageLoro = loroSchema.LoroMap(
  {
    content: loroSchema.String({ required: false }),
    originalLocale: loroSchema.String<Locale>({ required: false }),
    translatedAtCrdtFrontier: loroSchema.String({ required: false }),
    translationSource: loroSchema.String<TranslationSource>({ required: false }),
  },
  { required: false },
)

export const PostMetadataStorageLoro = loroSchema.LoroMap({
  attendanceMode: loroSchema.String<EventAttendanceMode>({ required: false }),
  endDate: loroSchema.String({ required: false }),
  handle: loroSchema.String<Handle>({ required: true }),
  kind: loroSchema.String<"NOTE" | "EVENT">({ required: true }),
  locationOrUrl: loroSchema.String({ required: false }),
  ownerProfileId: loroSchema.String<ProfileId>({ required: true }),
  publishedAt: loroSchema.String({ required: true }),
  startDate: loroSchema.String({ required: false }),
  visibility: loroSchema.String<InformationVisibility>({ required: true }),
})

export const PostSourceDataStorageLoro = loroSchema({
  locales: loroSchema.LoroMap(
    {
      en: PostLocalizedDataStorageLoro,
      es: PostLocalizedDataStorageLoro,
      pt: PostLocalizedDataStorageLoro,
    },
    { required: true },
  ),
  metadata: PostMetadataStorageLoro,
})

const CommentLocalizedDataStorageLoro = loroSchema.LoroMap(
  {
    content: loroSchema.String({ required: false }),
    originalLocale: loroSchema.String<Locale>({ required: false }),
    translatedAtCrdtFrontier: loroSchema.String({ required: false }),
    translationSource: loroSchema.String<TranslationSource>({ required: false }),
  },
  { required: false },
)

const ResourceLocalizedDataStorageLoro = loroSchema.LoroMap(
  {
    title: loroSchema.String({ required: false }),
    description: loroSchema.String({ required: false }),
    creditLine: loroSchema.String({ required: false }),
    originalLocale: loroSchema.String<Locale>({ required: false }),
    translatedAtCrdtFrontier: loroSchema.String({ required: false }),
    translationSource: loroSchema.String<TranslationSource>({ required: false }),
  },
  { required: false },
)

export const ResourceMetadataStorageLoro = loroSchema.LoroMap({
  format: loroSchema.String({ required: true }),
  handle: loroSchema.String<Handle>({ required: true }),
  thumbnailImageId: loroSchema.String({ required: false }),
  url: loroSchema.String({ required: true }),
  urlState: loroSchema.String({ required: true }),
})

export const ResourceSourceDataStorageLoro = loroSchema({
  locales: loroSchema.LoroMap(
    {
      en: ResourceLocalizedDataStorageLoro,
      es: ResourceLocalizedDataStorageLoro,
      pt: ResourceLocalizedDataStorageLoro,
    },
    { required: true },
  ),
  metadata: ResourceMetadataStorageLoro,
})
export const CommentSourceDataStorageLoro = loroSchema({
  locales: loroSchema.LoroMap(
    {
      en: CommentLocalizedDataStorageLoro,
      es: CommentLocalizedDataStorageLoro,
      pt: CommentLocalizedDataStorageLoro,
    },
    { required: true },
  ),
})

type CrdtLocalizedData = {
  content: TiptapDocument
  originalLocale: Locale
  translatedAtCrdtFrontier?: LoroDocFrontier | null
  translationSource: TranslationSource
}

type CrdtSourcePostData = {
  locales: {
    en?: CrdtLocalizedData | undefined
    es?: CrdtLocalizedData | undefined
    pt?: CrdtLocalizedData | undefined
  }
  metadata:
    | {
        attendanceMode: EventAttendanceMode | null
        endDate: TimestampColumn | string | null
        handle: Handle
        kind: "EVENT"
        locationOrUrl: string | null
        ownerProfileId: ProfileId
        publishedAt: TimestampColumn | string
        startDate: TimestampColumn | string
        visibility: InformationVisibility
      }
    | {
        handle: Handle
        kind: "NOTE"
        ownerProfileId: ProfileId
        publishedAt: TimestampColumn | string
        visibility: InformationVisibility
      }
}

const encodeDateOrUndefined = (value: TimestampColumn | string | null | undefined) => {
  if (value == null) return undefined
  if (typeof value === "string") return value
  return DateTime.formatIso(value)
}

const encodeLocalizedData = (localeData: CrdtLocalizedData) => ({
  content: JSON.stringify(localeData.content),
  originalLocale: localeData.originalLocale,
  translatedAtCrdtFrontier: JSON.stringify(localeData.translatedAtCrdtFrontier ?? null),
  translationSource: localeData.translationSource,
})

export const sourcePostDataToCrdtStorage = (sourceData: CrdtSourcePostData) => ({
  locales: {
    en: sourceData.locales.en ? encodeLocalizedData(sourceData.locales.en) : {},
    es: sourceData.locales.es ? encodeLocalizedData(sourceData.locales.es) : {},
    pt: sourceData.locales.pt ? encodeLocalizedData(sourceData.locales.pt) : {},
  },
  metadata: {
    attendanceMode:
      sourceData.metadata.kind === "EVENT" ? sourceData.metadata.attendanceMode : undefined,
    endDate:
      sourceData.metadata.kind === "EVENT"
        ? encodeDateOrUndefined(sourceData.metadata.endDate)
        : undefined,
    handle: sourceData.metadata.handle,
    kind: sourceData.metadata.kind,
    locationOrUrl:
      sourceData.metadata.kind === "EVENT"
        ? (sourceData.metadata.locationOrUrl ?? undefined)
        : undefined,
    ownerProfileId: sourceData.metadata.ownerProfileId,
    publishedAt: encodeDateOrUndefined(sourceData.metadata.publishedAt),
    startDate:
      sourceData.metadata.kind === "EVENT"
        ? encodeDateOrUndefined(sourceData.metadata.startDate)
        : undefined,
    visibility: sourceData.metadata.visibility,
  },
})

type CrdtSourceCommentData = {
  locales: {
    en?: CrdtLocalizedData | undefined
    es?: CrdtLocalizedData | undefined
    pt?: CrdtLocalizedData | undefined
  }
}

export const sourceCommentDataToCrdtStorage = (sourceData: CrdtSourceCommentData) => ({
  locales: {
    en: sourceData.locales.en ? encodeLocalizedData(sourceData.locales.en) : {},
    es: sourceData.locales.es ? encodeLocalizedData(sourceData.locales.es) : {},
    pt: sourceData.locales.pt ? encodeLocalizedData(sourceData.locales.pt) : {},
  },
})

type CrdtResourceLocalizedData = {
  title: string
  description: TiptapDocument | null
  creditLine: string | null
  originalLocale: Locale
  translatedAtCrdtFrontier?: LoroDocFrontier | null
  translationSource: TranslationSource
}

type CrdtSourceResourceData = {
  locales: {
    en?: CrdtResourceLocalizedData | undefined
    es?: CrdtResourceLocalizedData | undefined
    pt?: CrdtResourceLocalizedData | undefined
  }
  metadata: {
    format: string
    handle: Handle
    thumbnailImageId: string | null
    url: string
    urlState: string
  }
}

const encodeResourceLocalizedData = (localeData: CrdtResourceLocalizedData) => ({
  title: localeData.title,
  description: localeData.description === null ? undefined : JSON.stringify(localeData.description),
  creditLine: localeData.creditLine ?? undefined,
  originalLocale: localeData.originalLocale,
  translatedAtCrdtFrontier: JSON.stringify(localeData.translatedAtCrdtFrontier ?? null),
  translationSource: localeData.translationSource,
})

export const sourceResourceDataToCrdtStorage = (sourceData: CrdtSourceResourceData) => ({
  locales: {
    en: sourceData.locales.en ? encodeResourceLocalizedData(sourceData.locales.en) : {},
    es: sourceData.locales.es ? encodeResourceLocalizedData(sourceData.locales.es) : {},
    pt: sourceData.locales.pt ? encodeResourceLocalizedData(sourceData.locales.pt) : {},
  },
  metadata: {
    format: sourceData.metadata.format,
    handle: sourceData.metadata.handle,
    thumbnailImageId: sourceData.metadata.thumbnailImageId ?? undefined,
    url: sourceData.metadata.url,
    urlState: sourceData.metadata.urlState,
  },
})
