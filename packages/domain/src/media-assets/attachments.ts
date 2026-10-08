import { Schema } from "effect"

import { MediaAssetId, PublicationId, WikiArticleId, WikiArticleRevisionId } from "../common/ids.js"
import { OptionalColumn } from "../common/primitives.js"
import { TiptapDocument } from "../rich-text/domain.js"

export const PublicationMediaAssetRow = Schema.Struct({
  publicationId: PublicationId,
  mediaAssetId: MediaAssetId,
})

export const MediaAssetDescriptions = Schema.Struct({
  pt: Schema.optional(TiptapDocument),
  es: Schema.optional(TiptapDocument),
  en: Schema.optional(TiptapDocument),
})

export const WikiArticleMediaAssetRow = Schema.Struct({
  wikiArticleId: WikiArticleId,
  mediaAssetId: MediaAssetId,
})
export type WikiArticleMediaAssetRow = typeof WikiArticleMediaAssetRow.Type

export const WikiArticleRevisionMediaAssetRow = Schema.Struct({
  wikiArticleRevisionId: WikiArticleRevisionId,
  mediaAssetId: MediaAssetId,
  category: Schema.NullOr(Schema.String),
  hasCategoryOverride: Schema.BooleanFromBit,
  descriptions: OptionalColumn(Schema.fromJsonString(MediaAssetDescriptions)),
})

export type WikiArticleRevisionMediaAssetRow = typeof WikiArticleRevisionMediaAssetRow.Type

export const WikiMediaSelection = Schema.Array(
  Schema.Struct({
    mediaAssetId: MediaAssetId,
    category: Schema.optional(Schema.NullOr(Schema.String)),
    descriptions: Schema.optional(MediaAssetDescriptions),
  }),
)

export type WikiMediaSelection = typeof WikiMediaSelection.Type
