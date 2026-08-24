import { DateTime, Predicate, Schema } from "effect"
import { schema as loroSchema } from "loro-mirror"

import type { SourceCommentData } from "../comments/domain.js"
import {
  EventAttendanceMode,
  InformationVisibility,
  Locale,
  TranslationSource,
} from "../common/enums.js"
import { PersonId, ProfileId } from "../common/ids.js"
import { Handle, TimestampColumn } from "../common/primitives.js"
import type { PublicationLocalizedData, PublicationSourceData } from "../publications/domain.js"
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

export const PublicationLocalizedDataLoro = loroSchema.LoroMap(
  {
    content: loroSchema.LoroText(),
    original_locale: loroSchema.String<Locale>(),
    translation_source: loroSchema.String<TranslationSource>(),
  },
  { required: true },
)

export const PostMetadataLoro = loroSchema.LoroMap({
  handle: loroSchema.String<Handle>({ required: true }),
  kind: loroSchema.String<"POST">(),
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

export const PostSourceDataLoro = loroSchema({
  locales: loroSchema.LoroMap(
    {
      en: PublicationLocalizedDataLoro,
      es: PublicationLocalizedDataLoro,
      pt: PublicationLocalizedDataLoro,
    },
    { required: true },
  ),
  metadata: PostMetadataLoro,
})

export const EventSourceDataLoro = loroSchema({
  locales: loroSchema.LoroMap(
    {
      en: PublicationLocalizedDataLoro,
      es: PublicationLocalizedDataLoro,
      pt: PublicationLocalizedDataLoro,
    },
    { required: true },
  ),
  metadata: EventMetadataLoro,
})

const PublicationLocalizedDataStorageLoro = loroSchema.LoroMap(
  {
    content: loroSchema.String({ required: false }),
    originalLocale: loroSchema.String<Locale>({ required: false }),
    translatedAtCrdtFrontier: loroSchema.String({ required: false }),
    translationSource: loroSchema.String<TranslationSource>({ required: false }),
  },
  { required: false },
)

export const PublicationMetadataStorageLoro = loroSchema.LoroMap({
  attendanceMode: loroSchema.String<EventAttendanceMode>({ required: false }),
  endDate: loroSchema.String({ required: false }),
  handle: loroSchema.String<Handle>({ required: true }),
  kind: loroSchema.String<"POST" | "EVENT">({ required: true }),
  locationOrUrl: loroSchema.String({ required: false }),
  ownerProfileId: loroSchema.String<ProfileId>({ required: true }),
  publishedAt: loroSchema.String({ required: true }),
  startDate: loroSchema.String({ required: false }),
  visibility: loroSchema.String<InformationVisibility>({ required: true }),
})

export const PublicationSourceDataStorageLoro = loroSchema({
  locales: loroSchema.LoroMap(
    {
      en: PublicationLocalizedDataStorageLoro,
      es: PublicationLocalizedDataStorageLoro,
      pt: PublicationLocalizedDataStorageLoro,
    },
    { required: true },
  ),
  metadata: PublicationMetadataStorageLoro,
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

const encodeDateOrUndefined = (value: unknown) => {
  if (value == null) return undefined
  if (Predicate.isString(value)) return value
  if (Schema.is(TimestampColumn)(value)) return DateTime.formatIso(value)
  return undefined
}

const encodeLocalizedData = (localeData: PublicationLocalizedData) => ({
  content: Schema.encodeSync(Schema.fromJsonString(TiptapDocument))(localeData.content),
  originalLocale: localeData.originalLocale,
  translatedAtCrdtFrontier: Schema.encodeSync(
    Schema.fromJsonString(Schema.NullOr(LoroDocFrontier)),
  )("translatedAtCrdtFrontier" in localeData ? localeData.translatedAtCrdtFrontier : null),
  translationSource: localeData.translationSource,
})

export const sourcePublicationDataToCrdtStorage = (sourceData: PublicationSourceData) => ({
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

export const sourceCommentDataToCrdtStorage = (sourceData: SourceCommentData) => ({
  locales: {
    en: sourceData.locales.en ? encodeLocalizedData(sourceData.locales.en) : undefined,
    es: sourceData.locales.es ? encodeLocalizedData(sourceData.locales.es) : undefined,
    pt: sourceData.locales.pt ? encodeLocalizedData(sourceData.locales.pt) : undefined,
  },
})
