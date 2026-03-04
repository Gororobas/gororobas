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
import { Handle } from "../common/primitives.js"
import { LoroDocUpdate } from "../crdts/domain.js"
import { TiptapDocument } from "../rich-text/domain.js"

export const ResourceMetadata = Schema.Struct({
  format: ResourceFormat,
  handle: Handle,
  thumbnailImageId: Schema.NullishOr(ImageId),
  url: Schema.NonEmptyTrimmedString,
  urlState: ResourceUrlState,
})
export type ResourceMetadata = typeof ResourceMetadata.Type

export const ResourceLocalizedData = Schema.Struct({
  creditLine: Schema.NullishOr(Schema.String),
  description: Schema.NullishOr(TiptapDocument),
  originalLocale: Locale,
  title: Schema.NonEmptyTrimmedString,
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
  description: Schema.NullishOr(Schema.parseJson(TiptapDocument)),
  locale: Locale,
})
export type QueriedResourceData = typeof QueriedResourceData.Type

export const ResourceRevisionData = Schema.Struct({
  updatedAt: Schema.DateFromString,
  createdAt: Schema.DateFromString,
  evaluatedAt: Schema.NullishOr(Schema.DateFromString),
  evaluatedById: Schema.NullishOr(PersonId),
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
  thumbnailImageId: Schema.NullishOr(ImageId),
  title: Schema.NonEmptyTrimmedString,
})
export type ResourceCardData = typeof ResourceCardData.Type

export const ResourcePageData = Schema.Struct({
  creditLine: Schema.NullishOr(Schema.String),
  description: Schema.NullishOr(Schema.parseJson(TiptapDocument)),
  format: ResourceFormat,
  handle: Handle,
  id: ResourceId,
  locale: Locale,
  tags: Schema.Array(
    Schema.Struct({
      handle: Schema.NonEmptyTrimmedString,
      id: TagId,
    }),
  ),
  thumbnailImageId: Schema.NullishOr(ImageId),
  title: Schema.NonEmptyTrimmedString,
  url: Schema.NonEmptyTrimmedString,
  urlState: Schema.String,
  vegetableHandles: Schema.Array(Schema.NonEmptyTrimmedString),
})
export type ResourcePageData = typeof ResourcePageData.Type

export const CreateResourceData = Schema.Struct({
  creditLine: Schema.optional(Schema.NullishOr(Schema.String)),
  description: Schema.optional(Schema.NullishOr(TiptapDocument)),
  format: ResourceFormat,
  handle: Handle,
  thumbnailImageId: Schema.optional(Schema.NullishOr(ImageId)),
  title: Schema.NonEmptyTrimmedString,
  url: Schema.NonEmptyTrimmedString,
})
export type CreateResourceData = typeof CreateResourceData.Type

export const UpdateResourceData = Schema.Struct({
  creditLine: Schema.optional(Schema.NullishOr(Schema.String)),
  description: Schema.optional(Schema.NullishOr(TiptapDocument)),
  format: Schema.optional(ResourceFormat),
  handle: Schema.optional(Handle),
  thumbnailImageId: Schema.optional(Schema.NullishOr(ImageId)),
  title: Schema.optional(Schema.NonEmptyTrimmedString),
  url: Schema.optional(Schema.NonEmptyTrimmedString),
})
export type UpdateResourceData = typeof UpdateResourceData.Type

export const ResourceSearchParams = Schema.Struct({
  format: Schema.optional(ResourceFormat),
  page: Schema.NumberFromString,
  query: Schema.optional(Schema.String),
  tagIds: Schema.optional(Schema.parseJson(Schema.Array(TagId))),
})

export const ResourceTranslationData = Schema.Struct({
  creditLine: Schema.NullishOr(Schema.String),
  description: Schema.NullishOr(TiptapDocument),
  locale: Locale,
  title: Schema.NonEmptyTrimmedString,
})
export type ResourceTranslationData = typeof ResourceTranslationData.Type

export const ResourceBookmark = Schema.Struct({
  personId: PersonId,
  resourceId: ResourceId,
  state: BookmarkState,
})
export type ResourceBookmark = typeof ResourceBookmark.Type
