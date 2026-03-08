/**
 * Resource domain entity and related types.
 */
import { Schema } from "effect"

import {
  BookmarkState,
  Locale,
  ResourceFormat,
  ResourceUrlState,
  RevisionEvaluation,
  TranslationSource,
} from "../common/enums.js"
import { ImageId, PersonId, ResourceId, ResourceRevisionId, TagId } from "../common/ids.js"
import { Handle, TimestampColumn } from "../common/primitives.js"
import { LoroDocUpdate } from "../crdts/domain.js"
import { TiptapDocument } from "../rich-text/domain.js"

export const ResourceMetadata = Schema.Struct({
  format: ResourceFormat,
  handle: Handle,
  thumbnailImageId: Schema.NullOr(ImageId),
  url: Schema.Trimmed.check(Schema.isNonEmpty()),
  urlState: ResourceUrlState,
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
  tags: Schema.Array(
    Schema.Struct({
      handle: Schema.Trimmed.check(Schema.isNonEmpty()),
      id: TagId,
    }),
  ),
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
