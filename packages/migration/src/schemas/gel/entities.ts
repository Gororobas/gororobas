import { OptionalColumn } from "@gororobas/domain"
/**
 * Gel entity schemas.
 */
import { Schema } from "effect"

import * as Enums from "./enums.js"

// ============ Base Types ============

export const GelAuditableFields = Schema.Struct({
  created_at: Schema.String,
  updated_at: Schema.String,
  created_by_id: Schema.String,
})

export const GelWithHandleFields = Schema.Struct({
  handle: Schema.String,
})

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
  created_at: Schema.String,
  updated_at: Schema.String,
  handle: Schema.String,
})
export type GelUserProfile = typeof GelUserProfile.Type

export const GelHistoryLog = Schema.Struct({
  id: Schema.String,
  action: Enums.GelHistoryAction,
  timestamp: Schema.String,
  performed_by: Schema.String.pipe(Schema.optional), // UserProfile.id
  old: Schema.Unknown.pipe(Schema.optional), // json
  new: Schema.Unknown.pipe(Schema.optional), // json
  target: Schema.String, // Polymorphic - will be handled as string for now
})
export type GelHistoryLog = typeof GelHistoryLog.Type

export const GelSource = Schema.Struct({
  id: Schema.String,
  type: Enums.GelSourceType,
  credits: Schema.String.pipe(Schema.optional),
  origin: Schema.String.pipe(Schema.optional),
  comments: Schema.Unknown.pipe(Schema.optional), // json
  created_at: Schema.String,
  updated_at: Schema.String,
  created_by_id: Schema.String.pipe(Schema.optional),
})
export type GelSource = typeof GelSource.Type

export const GelTag = Schema.Struct({
  id: Schema.String,
  names: Schema.Array(Schema.String),
  description: Schema.Unknown.pipe(Schema.optional), // json
  category: Schema.String.pipe(Schema.optional),
  created_at: Schema.String,
  updated_at: Schema.String,
  created_by_id: Schema.String.pipe(Schema.optional),
  handle: Schema.String,
})
export type GelTag = typeof GelTag.Type

export const GelImage = Schema.Struct({
  id: Schema.String,
  sanity_id: Schema.String,
  label: Schema.String.pipe(Schema.optional),
  hotspot: Schema.Unknown.pipe(Schema.optional), // json
  crop: Schema.Unknown.pipe(Schema.optional), // json
  created_at: Schema.String,
  updated_at: Schema.String,
  created_by_id: Schema.String.pipe(Schema.optional),
})
export type GelImage = typeof GelImage.Type

export const GelVegetableVariety = Schema.Struct({
  id: Schema.String,
  names: Schema.Array(Schema.String),
  created_at: Schema.String,
  updated_at: Schema.String,
  created_by_id: Schema.String.pipe(Schema.optional),
  handle: Schema.String,
})
export type GelVegetableVariety = typeof GelVegetableVariety.Type

export const GelVegetableTip = Schema.Struct({
  id: Schema.String,
  subjects: Schema.Array(Enums.GelTipSubject),
  content: Schema.Unknown, // json
  created_at: Schema.String,
  updated_at: Schema.String,
  created_by_id: Schema.String.pipe(Schema.optional),
  handle: Schema.String,
})
export type GelVegetableTip = typeof GelVegetableTip.Type

export const GelVegetable = Schema.Struct({
  id: Schema.String,
  names: Schema.Array(Schema.String),
  searchable_names: OptionalColumn(Schema.String), // computed field
  scientific_names: OptionalColumn(Schema.Array(Schema.String)),
  gender: OptionalColumn(Enums.GelGender),
  strata: OptionalColumn(Schema.Array(Enums.GelStratum)),
  planting_methods: OptionalColumn(Schema.Array(Enums.GelPlantingMethod)),
  edible_parts: OptionalColumn(Schema.Array(Enums.GelEdiblePart)),
  lifecycles: OptionalColumn(Schema.Array(Enums.GelVegetableLifeCycle)),
  uses: OptionalColumn(Schema.Array(Enums.GelVegetableUsage)),
  origin: OptionalColumn(Schema.String),
  development_cycle_min: OptionalColumn(Schema.Number),
  development_cycle_max: OptionalColumn(Schema.Number),
  height_min: OptionalColumn(Schema.Number),
  height_max: OptionalColumn(Schema.Number),
  temperature_min: OptionalColumn(Schema.Number),
  temperature_max: OptionalColumn(Schema.Number),
  content: OptionalColumn(Schema.Unknown), // json
  created_at: Schema.DateTimeUtcFromDate,
  updated_at: Schema.DateTimeUtcFromDate,
  created_by_id: Schema.String.pipe(Schema.optional),
  handle: Schema.String,
})
export type GelVegetable = typeof GelVegetable.Type

export const GelVegetableFriendship = Schema.Struct({
  id: Schema.String,
  vegetables: Schema.Array(Schema.String), // Vegetable.id[]
  unique_key: Schema.String,
  created_at: Schema.String,
  updated_at: Schema.String,
  created_by_id: Schema.String.pipe(Schema.optional),
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
  id: Schema.String,
  // oxlint-disable-next-line effect/require-is-prefix-for-boolean-schema-field
  public: Schema.Boolean,
  publish_status: Enums.GelNotePublishStatus.pipe(Schema.optional),
  published_at: Schema.String,
  types: Schema.Array(Enums.GelNoteType),
  title: Schema.Unknown, // json
  body: Schema.Unknown.pipe(Schema.optional), // json
  content_plain_text: Schema.String.pipe(Schema.optional),
  created_at: Schema.String,
  updated_at: Schema.String,
  created_by_id: Schema.String.pipe(Schema.optional),
  handle: Schema.String,
})
export type GelNote = typeof GelNote.Type

export const GelEditSuggestion = Schema.Struct({
  id: Schema.String,
  diff: Schema.Unknown, // json - json-diff-ts format
  snapshot: Schema.Unknown, // json
  status: Enums.GelEditSuggestionStatus,
  reviewed_by_id: Schema.String.pipe(Schema.optional), // UserProfile.id
  created_at: Schema.DateTimeUtcFromDate,
  updated_at: Schema.DateTimeUtcFromDate,
  created_by_id: Schema.String.pipe(Schema.optional),
})
export type GelEditSuggestion = typeof GelEditSuggestion.Type

export const GelResource = Schema.Struct({
  id: Schema.String,
  url: Schema.String,
  title: Schema.String,
  format: Enums.GelResourceFormat,
  description: Schema.Unknown.pipe(Schema.optional), // json
  credit_line: Schema.String.pipe(Schema.optional),
  thumbnail: Schema.String.pipe(Schema.optional), // Image.id
  created_at: Schema.String,
  updated_at: Schema.String,
  created_by_id: Schema.String.pipe(Schema.optional),
  handle: Schema.String,
})
export type GelResource = typeof GelResource.Type

export const GelBlueskyPost = Schema.Struct({
  id: Schema.String,
  text: Schema.String,
  content: Schema.String, // PostableToBluesky entity id
  created_at: Schema.String,
  updated_at: Schema.String,
  created_by_id: Schema.String.pipe(Schema.optional),
})
export type GelBlueskyPost = typeof GelBlueskyPost.Type

export const GelVegetableForConversion = Schema.Struct({
  ...GelVegetable.fields,
  edit_suggestions: Schema.Array(GelEditSuggestion),
})
export type GelVegetableForConversion = typeof GelVegetableForConversion.Type
