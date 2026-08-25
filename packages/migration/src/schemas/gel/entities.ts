import { TiptapDocument } from "@gororobas/domain"
/**
 * Gel entity schemas.
 */
import { Schema } from "effect"

import * as Enums from "./enums.js"

export const GelOptionalColumn = <S extends Schema.Schema<unknown>>(s: S) =>
  Schema.optional(Schema.NullishOr(s))

// ============ Base Types ============

const GelTimestamp = Schema.Date

export const gelAuditableFields = {
  created_at: GelTimestamp,
  updated_at: Schema.NullishOr(GelTimestamp),
  // created_by: Schema.String,
}

const gelEmbeddedAuditableFields = {
  created_at: Schema.optional(GelTimestamp),
  updated_at: Schema.optional(Schema.NullishOr(GelTimestamp)),
}

// ============ Core Entities ============

export const GelUser = Schema.Struct({
  id: Schema.String,
  identity: Schema.String, // ext::auth::Identity
  email: Schema.String,
  userRole: Enums.GelRole.pipe(Schema.optional),
  created: Schema.String,
  updated: Schema.String,
})
export type GelUser = typeof GelUser.Type

export const GelUserProfile = Schema.Struct({
  id: Schema.String,
  user: Schema.String, // User.id
  name: Schema.String,
  bio: Schema.Unknown, // json
  location: Schema.String.pipe(Schema.optional),
  photo: Schema.String.pipe(Schema.optional), // Image.id
  handle: Schema.String,
})
export type GelUserProfile = typeof GelUserProfile.Type

export const GelHistoryLog = Schema.Struct({
  id: Schema.String,
  action: Enums.GelHistoryAction,
  timestamp: GelTimestamp,
  performed_by: GelOptionalColumn(Schema.String), // UserProfile.id
  old: GelOptionalColumn(Schema.Unknown), // json
  new: GelOptionalColumn(Schema.Unknown), // json
  target: Schema.String, // Polymorphic - will be handled as string for now
})
export type GelHistoryLog = typeof GelHistoryLog.Type

export const GelSource = Schema.Struct({
  ...gelEmbeddedAuditableFields,
  id: Schema.String,
  type: Enums.GelSourceType,
  credits: GelOptionalColumn(Schema.String),
  origin: GelOptionalColumn(Schema.String),
  comments: GelOptionalColumn(Schema.Unknown), // json
})
export type GelSource = typeof GelSource.Type

export const GelTag = Schema.Struct({
  ...gelAuditableFields,
  id: Schema.String,
  names: Schema.Array(Schema.String),
  description: GelOptionalColumn(Schema.Unknown), // json
  category: GelOptionalColumn(Schema.String),
  handle: Schema.String,
})
export type GelTag = typeof GelTag.Type

export const GelImage = Schema.Struct({
  ...gelEmbeddedAuditableFields,
  id: Schema.String,
  sanity_id: Schema.String,
  label: GelOptionalColumn(Schema.String),
  hotspot: GelOptionalColumn(Schema.Unknown), // json
  crop: GelOptionalColumn(Schema.Unknown), // json
})
export type GelImage = typeof GelImage.Type

export const GelVegetableVariety = Schema.Struct({
  ...gelEmbeddedAuditableFields,
  id: Schema.String,
  names: Schema.Array(Schema.String),
  handle: Schema.String,
  photos: Schema.Array(GelImage),
})
export type GelVegetableVariety = typeof GelVegetableVariety.Type

export const GelVegetableTip = Schema.Struct({
  ...gelAuditableFields,
  id: Schema.String,
  subjects: Schema.Array(Enums.GelTipSubject),
  content: Schema.Unknown, // json
  handle: Schema.String,
})
export type GelVegetableTip = typeof GelVegetableTip.Type

export const GelVegetable = Schema.Struct({
  ...gelAuditableFields,
  id: Schema.String,
  names: Schema.Array(Schema.String),
  searchable_names: GelOptionalColumn(Schema.String), // computed field
  scientific_names: GelOptionalColumn(Schema.Array(Schema.String)),
  gender: GelOptionalColumn(Enums.GelGender),
  strata: GelOptionalColumn(Schema.Array(Enums.GelStratum)),
  planting_methods: GelOptionalColumn(Schema.Array(Enums.GelPlantingMethod)),
  edible_parts: GelOptionalColumn(Schema.Array(Enums.GelEdiblePart)),
  lifecycles: GelOptionalColumn(Schema.Array(Enums.GelVegetableLifeCycle)),
  uses: GelOptionalColumn(Schema.Array(Enums.GelVegetableUsage)),
  origin: GelOptionalColumn(Schema.String),
  development_cycle_min: GelOptionalColumn(Schema.Number),
  development_cycle_max: GelOptionalColumn(Schema.Number),
  height_min: GelOptionalColumn(Schema.Number),
  height_max: GelOptionalColumn(Schema.Number),
  temperature_min: GelOptionalColumn(Schema.Number),
  temperature_max: GelOptionalColumn(Schema.Number),
  content: GelOptionalColumn(Schema.Unknown), // json
  handle: Schema.String,
})
export type GelVegetable = typeof GelVegetable.Type

const GelVegetableFriend = Schema.Struct({
  id: Schema.String,
})

export const GelVegetableFriendship = Schema.Struct({
  ...gelAuditableFields,
  id: Schema.String,
  vegetables: Schema.Array(Schema.String), // Vegetable.id[]
  unique_key: Schema.String,
})
export type GelVegetableFriendship = typeof GelVegetableFriendship.Type

export const GelUserWishlist = Schema.Struct({
  id: Schema.String,
  user_profile: Schema.String, // UserProfile.id
  vegetable: Schema.String, // Vegetable.id
  status: Enums.GelVegetableWishlistStatus,
})
export type GelUserWishlist = typeof GelUserWishlist.Type

export const GelNote = Schema.Struct({
  ...gelAuditableFields,
  id: Schema.String,
  // oxlint-disable-next-line effect/require-is-prefix-for-boolean-schema-field
  public: Schema.Boolean,
  publish_status: GelOptionalColumn(Enums.GelNotePublishStatus),
  published_at: Schema.String,
  types: Schema.Array(Enums.GelNoteType),
  title: TiptapDocument,
  body: GelOptionalColumn(TiptapDocument),
  content_plain_text: GelOptionalColumn(Schema.String),
  handle: Schema.String,
})
export type GelNote = typeof GelNote.Type

export const GelEditSuggestion = Schema.Struct({
  ...gelAuditableFields,
  id: Schema.String,
  diff: Schema.Unknown, // json - json-diff-ts format
  snapshot: Schema.Unknown, // json
  status: Enums.GelEditSuggestionStatus,
  reviewed_by_id: GelOptionalColumn(Schema.String), // UserProfile.id
})
export type GelEditSuggestion = typeof GelEditSuggestion.Type

export const GelResource = Schema.Struct({
  ...gelAuditableFields,
  id: Schema.String,
  url: Schema.String,
  title: Schema.String,
  format: Enums.GelResourceFormat,
  description: GelOptionalColumn(Schema.Unknown), // json
  credit_line: GelOptionalColumn(Schema.String),
  thumbnail: GelOptionalColumn(Schema.String), // Image.id
  handle: Schema.String,
})
export type GelResource = typeof GelResource.Type

export const GelVegetableForReconstruction = Schema.Struct({
  ...GelVegetable.fields,
  photos: Schema.Array(GelImage),
  varieties: Schema.Array(GelVegetableVariety),
  friends: Schema.Array(GelVegetableFriend),
  sources: Schema.Array(GelSource),
})
export type GelVegetableForReconstruction = typeof GelVegetableForReconstruction.Type

export const GelVegetableWithEditSuggestions = Schema.Struct({
  ...GelVegetableForReconstruction.fields,
  edit_suggestions: Schema.Array(GelEditSuggestion),
})
export type GelVegetableWithEditSuggestions = typeof GelVegetableWithEditSuggestions.Type
