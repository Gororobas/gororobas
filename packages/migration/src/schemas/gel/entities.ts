import { OptionalColumn } from "@gororobas/domain"
/**
 * Gel entity schemas.
 */
import { Schema } from "effect"

import * as Enums from "./enums.js"

// ============ Base Types ============

export const AuditableFields = Schema.Struct({
  created_at: Schema.String,
  updated_at: Schema.String,
  created_by_id: Schema.String,
})

export const WithHandleFields = Schema.Struct({
  handle: Schema.String,
})

// ============ Core Entities ============

export const User = Schema.Struct({
  id: Schema.String,
  identity: Schema.String, // ext::auth::Identity
  email: Schema.String,
  userRole: Enums.Role.pipe(Schema.optional),
  created: Schema.String,
  updated: Schema.String,
})
export type User = typeof User.Type

export const UserProfile = Schema.Struct({
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
export type UserProfile = typeof UserProfile.Type

export const HistoryLog = Schema.Struct({
  id: Schema.String,
  action: Enums.HistoryAction,
  timestamp: Schema.String,
  performed_by: Schema.String.pipe(Schema.optional), // UserProfile.id
  old: Schema.Unknown.pipe(Schema.optional), // json
  new: Schema.Unknown.pipe(Schema.optional), // json
  target: Schema.String, // Polymorphic - will be handled as string for now
})
export type HistoryLog = typeof HistoryLog.Type

export const Source = Schema.Struct({
  id: Schema.String,
  type: Enums.SourceType,
  credits: Schema.String.pipe(Schema.optional),
  origin: Schema.String.pipe(Schema.optional),
  comments: Schema.Unknown.pipe(Schema.optional), // json
  created_at: Schema.String,
  updated_at: Schema.String,
  created_by_id: Schema.String.pipe(Schema.optional),
})
export type Source = typeof Source.Type

export const Tag = Schema.Struct({
  id: Schema.String,
  names: Schema.Array(Schema.String),
  description: Schema.Unknown.pipe(Schema.optional), // json
  category: Schema.String.pipe(Schema.optional),
  created_at: Schema.String,
  updated_at: Schema.String,
  created_by_id: Schema.String.pipe(Schema.optional),
  handle: Schema.String,
})
export type Tag = typeof Tag.Type

export const Image = Schema.Struct({
  id: Schema.String,
  sanity_id: Schema.String,
  label: Schema.String.pipe(Schema.optional),
  hotspot: Schema.Unknown.pipe(Schema.optional), // json
  crop: Schema.Unknown.pipe(Schema.optional), // json
  created_at: Schema.String,
  updated_at: Schema.String,
  created_by_id: Schema.String.pipe(Schema.optional),
})
export type Image = typeof Image.Type

export const VegetableVariety = Schema.Struct({
  id: Schema.String,
  names: Schema.Array(Schema.String),
  created_at: Schema.String,
  updated_at: Schema.String,
  created_by_id: Schema.String.pipe(Schema.optional),
  handle: Schema.String,
})
export type VegetableVariety = typeof VegetableVariety.Type

export const VegetableTip = Schema.Struct({
  id: Schema.String,
  subjects: Schema.Array(Enums.TipSubject),
  content: Schema.Unknown, // json
  created_at: Schema.String,
  updated_at: Schema.String,
  created_by_id: Schema.String.pipe(Schema.optional),
  handle: Schema.String,
})
export type VegetableTip = typeof VegetableTip.Type

export const VegetableInGel = Schema.Struct({
  id: Schema.String,
  names: Schema.Array(Schema.String),
  searchable_names: OptionalColumn(Schema.String), // computed field
  scientific_names: OptionalColumn(Schema.Array(Schema.String)),
  gender: OptionalColumn(Enums.Gender),
  strata: OptionalColumn(Schema.Array(Enums.Stratum)),
  planting_methods: OptionalColumn(Schema.Array(Enums.PlantingMethod)),
  edible_parts: OptionalColumn(Schema.Array(Enums.EdiblePart)),
  lifecycles: OptionalColumn(Schema.Array(Enums.VegetableLifeCycle)),
  uses: OptionalColumn(Schema.Array(Enums.VegetableUsage)),
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
export type VegetableInGel = typeof VegetableInGel.Type

export const VegetableFriendship = Schema.Struct({
  id: Schema.String,
  vegetables: Schema.Array(Schema.String), // Vegetable.id[]
  unique_key: Schema.String,
  created_at: Schema.String,
  updated_at: Schema.String,
  created_by_id: Schema.String.pipe(Schema.optional),
})
export type VegetableFriendship = typeof VegetableFriendship.Type

export const UserWishlist = Schema.Struct({
  id: Schema.String,
  user_profile: Schema.String, // UserProfile.id
  vegetable: Schema.String, // Vegetable.id
  status: Enums.VegetableWishlistStatus,
})
export type UserWishlist = typeof UserWishlist.Type

export const Note = Schema.Struct({
  id: Schema.String,
  // oxlint-disable-next-line effect/require-is-prefix-for-boolean-schema-field
  public: Schema.Boolean,
  publish_status: Enums.NotePublishStatus.pipe(Schema.optional),
  published_at: Schema.String,
  types: Schema.Array(Enums.NoteType),
  title: Schema.Unknown, // json
  body: Schema.Unknown.pipe(Schema.optional), // json
  content_plain_text: Schema.String.pipe(Schema.optional),
  created_at: Schema.String,
  updated_at: Schema.String,
  created_by_id: Schema.String.pipe(Schema.optional),
  handle: Schema.String,
})
export type Note = typeof Note.Type

export const EditSuggestion = Schema.Struct({
  id: Schema.String,
  target_object: Schema.String, // Vegetable.id
  diff: Schema.Unknown, // json - json-diff-ts format
  snapshot: Schema.Unknown, // json
  status: Enums.EditSuggestionStatus,
  reviewed_by: Schema.String.pipe(Schema.optional), // UserProfile.id
  created_at: Schema.String,
  updated_at: Schema.String,
  created_by_id: Schema.String.pipe(Schema.optional),
})
export type EditSuggestion = typeof EditSuggestion.Type

export const Resource = Schema.Struct({
  id: Schema.String,
  url: Schema.String,
  title: Schema.String,
  format: Enums.ResourceFormat,
  description: Schema.Unknown.pipe(Schema.optional), // json
  credit_line: Schema.String.pipe(Schema.optional),
  thumbnail: Schema.String.pipe(Schema.optional), // Image.id
  created_at: Schema.String,
  updated_at: Schema.String,
  created_by_id: Schema.String.pipe(Schema.optional),
  handle: Schema.String,
})
export type Resource = typeof Resource.Type

export const BlueskyPost = Schema.Struct({
  id: Schema.String,
  text: Schema.String,
  content: Schema.String, // PostableToBluesky entity id
  created_at: Schema.String,
  updated_at: Schema.String,
  created_by_id: Schema.String.pipe(Schema.optional),
})
export type BlueskyPost = typeof BlueskyPost.Type
