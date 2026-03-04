/**
 * Media and Image domain entities.
 */
import { Schema } from "effect"

import { ImageId, PersonId, ProfileId } from "../common/ids.js"
import { TimestampedStruct } from "../common/primitives.js"

export const ImageRow = Schema.Struct({
  ...TimestampedStruct.fields,
  crop: Schema.NullishOr(Schema.Unknown),
  hotspot: Schema.NullishOr(Schema.Unknown),
  id: ImageId,
  label: Schema.NullishOr(Schema.String),
  metadata: Schema.NullishOr(Schema.Unknown),
  ownerProfileId: ProfileId,
  sanityId: Schema.NonEmptyTrimmedString,
})
export type ImageRow = typeof ImageRow.Type

export const ImageCredit = Schema.Struct({
  creditLine: Schema.NullishOr(Schema.String),
  creditUrl: Schema.NullishOr(Schema.String),
  imageId: ImageId,
  orderIndex: Schema.Int,
  personId: Schema.NullishOr(PersonId),
})
export type ImageCredit = typeof ImageCredit.Type
