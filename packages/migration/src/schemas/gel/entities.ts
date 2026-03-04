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

export const Vegetable = Schema.Struct({
  id: Schema.String,
  names: Schema.Array(Schema.String),
  searchable_names: Schema.String.pipe(Schema.optional), // computed field
  scientific_names: Schema.Array(Schema.String).pipe(Schema.optional),
  gender: Enums.Gender.pipe(Schema.optional),
  strata: Schema.Array(Enums.Stratum).pipe(Schema.optional),
  planting_methods: Schema.Array(Enums.PlantingMethod).pipe(Schema.optional),
  edible_parts: Schema.Array(Enums.EdiblePart).pipe(Schema.optional),
  lifecycles: Schema.Array(Enums.VegetableLifeCycle).pipe(Schema.optional),
  uses: Schema.Array(Enums.VegetableUsage).pipe(Schema.optional),
  origin: Schema.String.pipe(Schema.optional),
  development_cycle_min: Schema.Number.pipe(Schema.optional),
  development_cycle_max: Schema.Number.pipe(Schema.optional),
  height_min: Schema.Number.pipe(Schema.optional),
  height_max: Schema.Number.pipe(Schema.optional),
  temperature_min: Schema.Number.pipe(Schema.optional),
  temperature_max: Schema.Number.pipe(Schema.optional),
  content: Schema.Unknown.pipe(Schema.optional), // json
  created_at: Schema.String,
  updated_at: Schema.String,
  created_by_id: Schema.String.pipe(Schema.optional),
  handle: Schema.String,
})
export type Vegetable = typeof Vegetable.Type

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
