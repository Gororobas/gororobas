/**
 * Media and Image domain entities.
 */
import { Schema } from "effect"

import { ImageId, PersonId, ProfileId } from "../common/ids.js"
import { TimestampedStruct } from "../common/primitives.js"

export const ImageRow = Schema.Struct({
  ...TimestampedStruct.fields,
  crop: Schema.NullOr(Schema.Unknown),
  hotspot: Schema.NullOr(Schema.Unknown),
  id: ImageId,
  label: Schema.NullOr(Schema.String),
  metadata: Schema.NullOr(Schema.Unknown),
  ownerProfileId: ProfileId,
  sanityId: Schema.Trimmed.check(Schema.isNonEmpty()),
})
export type ImageRow = typeof ImageRow.Type

export const ImageCredit = Schema.Struct({
  creditLine: Schema.NullOr(Schema.String),
  creditUrl: Schema.NullOr(Schema.String),
  imageId: ImageId,
  orderIndex: Schema.Int,
  personId: Schema.NullOr(PersonId),
})
export type ImageCredit = typeof ImageCredit.Type
