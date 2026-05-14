/**
 * Resource domain entity and related types.
 */
import { Schema, Struct } from "effect"

import {
  BookmarkState,
  Locale,
  ResourceFormat,
  ResourceUrlState,
  RevisionEvaluation,
  TranslationSource,
} from "../common/enums.js"
import {
  ImageId,
  PersonId,
  ResourceId,
  ResourceRevisionId,
  TagId,
  VegetableId,
} from "../common/ids.js"
import { Handle, TimestampColumn, TimestampedStruct } from "../common/primitives.js"
import { LoroDocFrontier, LoroDocSnapshot, LoroDocUpdate } from "../crdts/domain.js"
import { TiptapDocument } from "../rich-text/domain.js"
import { TagRow } from "../tags/domain.js"

export const ResourceMetadata = Schema.Struct({
  format: ResourceFormat,
  handle: Handle,
  thumbnailImageId: Schema.NullOr(ImageId),
  url: Schema.Trimmed.check(Schema.isNonEmpty()),
  urlState: ResourceUrlState,
  relatedTagIds: Schema.Array(TagId),
  relatedVegetableIds: Schema.Array(VegetableId),
})
export type ResourceMetadata = typeof ResourceMetadata.Type

export const ResourceLocalizedData = Schema.Struct({
  creditLine: Schema.NullOr(Schema.String),
  description: Schema.NullOr(TiptapDocument),
  originalLocale: Locale,
  title: Schema.Trimmed.check(Schema.isNonEmpty()),
  translationSource: TranslationSource,
})
export type ResourceLocalizedData = typeof ResourceLocalizedData.Type

/** Data stored in Loro CRDT documents, the source of what gets materialized in the database */
export const SourceResourceData = Schema.Struct({
  locales: Schema.Struct({
    en: Schema.optional(ResourceLocalizedData),
    es: Schema.optional(ResourceLocalizedData),
    pt: Schema.optional(ResourceLocalizedData),
  }),
  metadata: ResourceMetadata,
})
export type SourceResourceData = typeof SourceResourceData.Type

export const QueriedResourceData = Schema.Struct({
  ...ResourceMetadata.fields,
  ...ResourceLocalizedData.fields,
  description: Schema.NullOr(Schema.fromJsonString(TiptapDocument)),
  locale: Locale,
})
export type QueriedResourceData = typeof QueriedResourceData.Type

export const ResourceRevisionData = Schema.Struct({
  updatedAt: TimestampColumn,
  createdAt: TimestampColumn,
  evaluatedAt: Schema.NullOr(TimestampColumn),
  evaluatedById: Schema.NullOr(PersonId),
  evaluation: RevisionEvaluation,
  id: ResourceRevisionId,
  resourceId: ResourceId,
  createdById: PersonId,
  resourceHandle: Handle,
  crdtUpdate: LoroDocUpdate,
})
export type ResourceRevisionData = typeof ResourceRevisionData.Type

export const ResourceCardData = Schema.Struct({
  format: ResourceFormat,
  handle: Handle,
  id: ResourceId,
  locale: Locale,
  thumbnailImageId: Schema.NullOr(ImageId),
  title: Schema.Trimmed.check(Schema.isNonEmpty()),
})
export type ResourceCardData = typeof ResourceCardData.Type

export const ResourcePageData = Schema.Struct({
  creditLine: Schema.NullOr(Schema.String),
  description: Schema.NullOr(Schema.fromJsonString(TiptapDocument)),
  format: ResourceFormat,
  handle: Handle,
  id: ResourceId,
  locale: Locale,
  tags: Schema.Array(TagRow.mapFields(Struct.pick(["handle", "id"]))),
  thumbnailImageId: Schema.NullOr(ImageId),
  title: Schema.Trimmed.check(Schema.isNonEmpty()),
  url: Schema.Trimmed.check(Schema.isNonEmpty()),
  urlState: Schema.String,
  vegetableHandles: Schema.Array(Schema.Trimmed.check(Schema.isNonEmpty())),
})
export type ResourcePageData = typeof ResourcePageData.Type

export const CreateResourceData = Schema.Struct({
  creditLine: Schema.optional(Schema.NullOr(Schema.String)),
  description: Schema.optional(Schema.NullOr(TiptapDocument)),
  format: ResourceFormat,
  handle: Handle,
  thumbnailImageId: Schema.optional(Schema.NullOr(ImageId)),
  title: Schema.Trimmed.check(Schema.isNonEmpty()),
  url: Schema.Trimmed.check(Schema.isNonEmpty()),
})
export type CreateResourceData = typeof CreateResourceData.Type

export const UpdateResourceData = Schema.Struct({
  creditLine: Schema.optional(Schema.NullOr(Schema.String)),
  description: Schema.optional(Schema.NullOr(TiptapDocument)),
  format: Schema.optional(ResourceFormat),
  handle: Schema.optional(Handle),
  thumbnailImageId: Schema.optional(Schema.NullOr(ImageId)),
  title: Schema.optional(Schema.Trimmed.check(Schema.isNonEmpty())),
  url: Schema.optional(Schema.Trimmed.check(Schema.isNonEmpty())),
})
export type UpdateResourceData = typeof UpdateResourceData.Type

export const ResourceSearchParams = Schema.Struct({
  format: Schema.optional(ResourceFormat),
  page: Schema.NumberFromString,
  query: Schema.optional(Schema.String),
  tagIds: Schema.optional(Schema.fromJsonString(Schema.Array(TagId))),
})

export const ResourceTranslationData = Schema.Struct({
  creditLine: Schema.NullOr(Schema.String),
  description: Schema.NullOr(TiptapDocument),
  locale: Locale,
  title: Schema.Trimmed.check(Schema.isNonEmpty()),
})
export type ResourceTranslationData = typeof ResourceTranslationData.Type

export const ResourceBookmark = Schema.Struct({
  personId: PersonId,
  resourceId: ResourceId,
  state: BookmarkState,
})
export type ResourceBookmark = typeof ResourceBookmark.Type

export const ResourceCrdtRow = Schema.Struct({
  ...TimestampedStruct.fields,
  id: ResourceId,
  crdtSnapshot: LoroDocSnapshot,
})
export type ResourceCrdtRow = typeof ResourceCrdtRow.Type

export const ResourceRevisionRow = Schema.Struct({
  ...TimestampedStruct.fields,
  id: ResourceRevisionId,
  resourceId: ResourceId,
  createdById: Schema.NullOr(PersonId),
  crdtUpdate: LoroDocUpdate,
  fromCrdtFrontier: Schema.fromJsonString(LoroDocFrontier),
  evaluation: RevisionEvaluation,
  evaluatedById: Schema.NullOr(PersonId),
  evaluatedAt: Schema.NullOr(TimestampColumn),
})
export type ResourceRevisionRow = typeof ResourceRevisionRow.Type

export const ResourceRow = Schema.Struct({
  ...TimestampedStruct.fields,
  id: ResourceId,
  currentCrdtFrontier: Schema.fromJsonString(LoroDocFrontier),
  handle: Handle,
  url: Schema.Trimmed.check(Schema.isNonEmpty()),
  urlState: ResourceUrlState,
  lastCheckedAt: Schema.NullOr(TimestampColumn),
  format: ResourceFormat,
  thumbnailImageId: Schema.NullOr(ImageId),
})
export type ResourceRow = typeof ResourceRow.Type

export const ResourceTranslationRow = Schema.Struct({
  resourceId: ResourceId,
  locale: Locale,
  title: Schema.Trimmed.check(Schema.isNonEmpty()),
  description: Schema.NullOr(Schema.fromJsonString(TiptapDocument)),
  creditLine: Schema.NullOr(Schema.String),
  translatedAtCrdtFrontier: Schema.fromJsonString(Schema.NullOr(LoroDocFrontier)),
  translationSource: TranslationSource,
  originalLocale: Locale,
})
export type ResourceTranslationRow = typeof ResourceTranslationRow.Type

export const ResourceTagRow = Schema.Struct({
  resourceId: ResourceId,
  tagId: TagId,
})
export type ResourceTagRow = typeof ResourceTagRow.Type

export const ResourceVegetableRow = Schema.Struct({
  resourceId: ResourceId,
  vegetableId: VegetableId,
  orderIndex: Schema.Int,
})
export type ResourceVegetableRow = typeof ResourceVegetableRow.Type
