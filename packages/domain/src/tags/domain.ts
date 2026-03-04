/**
 * Tag domain entity.
 */
import { Schema } from "effect"

import { Locale, SuggestedTagStatus } from "../common/enums.js"
import { PersonId, PostId, SuggestedTagId, TagId } from "../common/ids.js"
import { Handle, TimestampedStruct } from "../common/primitives.js"
import { TiptapDocument } from "../rich-text/domain.js"

export const TagRow = Schema.Struct({
  ...TimestampedStruct.fields,
  id: TagId,
  cluster: Schema.NullishOr(Schema.String),
  createdById: Schema.NullishOr(PersonId),
  description: Schema.NullishOr(TiptapDocument),
  handle: Handle,
  names: Schema.parseJson(Schema.Record({ key: Locale, value: Schema.NonEmptyTrimmedString })),
})
export type TagRow = typeof TagRow.Type

export const SuggestedTagRow = Schema.Struct({
  ...TimestampedStruct.fields,
  id: SuggestedTagId,
  handle: Handle,
  status: SuggestedTagStatus,
  approvedTagId: Schema.NullishOr(TagId),
})
export type SuggestedTagRow = typeof SuggestedTagRow.Type

export const SuggestedTagSourceRow = Schema.Struct({
  suggestedTagId: SuggestedTagId,
  postId: PostId,
})
export type SuggestedTagSourceRow = typeof SuggestedTagSourceRow.Type
