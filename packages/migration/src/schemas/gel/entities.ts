import {
  AuthSubjectId,
  MediaAssetId,
  Email,
  Handle,
  NonEmptyTrimmedString,
  PlatformAccessLevel,
  PostSourceData,
  ProfileId,
  PublicationId,
  TagId,
  TiptapDocument,
  WikiArticleId,
} from "@gororobas/domain"
/**
 * Gel entity schemas.
 */
import { Effect, Schema } from "effect"

import * as Enums from "./enums.js"
import { GelTiptapDocument } from "./rich-text.js"

export const GelOptionalColumn = <S extends Schema.Schema<unknown>>(s: S) =>
  Schema.optional(Schema.NullishOr(s))

// ============ Base Types ============

export const GelTimestamp = Schema.Date

export { GelTiptapDocument } from "./rich-text.js"

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
  identity: Schema.Struct({
    id: Schema.String,
    issuer: Schema.String,
    subject: Schema.String,
  }),
  email: Schema.NullOr(Email),
  userRole: Enums.GelRole.pipe(Schema.optional),
  created: GelTimestamp,
  updated: GelTimestamp,
  // oxlint-disable-next-line effect/require-is-prefix-for-boolean-schema-field -- Gel uses snake_case in the migration query.
  is_email_verified: Schema.Boolean,
})
export type GelUser = typeof GelUser.Type

export const GelUserProfile = Schema.Struct({
  id: Schema.String,
  name: Schema.String,
  bio: GelOptionalColumn(Schema.toCodecJson(GelTiptapDocument)),
  location: GelOptionalColumn(Schema.String),
  photo: GelOptionalColumn(Schema.Struct({ id: Schema.String })),
  handle: Handle,
})
export type GelUserProfile = typeof GelUserProfile.Type

export const GelUserWithProfile = Schema.Struct({
  ...GelUser.fields,
  profile: Schema.Struct({
    ...GelUserProfile.fields,
    bookmarks_count: Schema.Int,
    edit_suggestions_count: Schema.Int,
    notes_count: Schema.Int,
    images_count: Schema.Int,
  }),
})
export type GelUserWithProfile = typeof GelUserWithProfile.Type

export const AccountDataForMigration = Schema.Struct({
  id: Schema.optional(AuthSubjectId),
  name: NonEmptyTrimmedString,
  email: Schema.NullOr(Email),
  // oxlint-disable-next-line effect/require-is-prefix-for-boolean-schema-field -- Matches the SQLite column.
  is_email_verified: Schema.Boolean,
  image: Schema.Null,
  created_at: GelTimestamp,
  updated_at: GelTimestamp,
})

const ProfileDataForMigration = Schema.Struct({
  id: Schema.optional(ProfileId),
  photoId: Schema.optional(Schema.NullOr(MediaAssetId)),
  type: Schema.Literal("PERSON"),
  handle: Handle,
  name: NonEmptyTrimmedString,
  bio: Schema.NullOr(TiptapDocument),
  location: Schema.NullOr(NonEmptyTrimmedString),
  photo_gel_id: Schema.NullOr(Schema.String),
  visibility: Schema.Literal("PUBLIC"),
  created_at: GelTimestamp,
  updated_at: GelTimestamp,
})

const PersonDataForMigration = Schema.Struct({
  access_level: PlatformAccessLevel,
  access_set_by_gel_id: Schema.Null,
  access_set_at: Schema.Null,
})

export const UserDataForMigration = Schema.Struct({
  latest_source: GelUserWithProfile,
  account: AccountDataForMigration,
  profile: ProfileDataForMigration,
  person: PersonDataForMigration,
})
export type UserDataForMigration = typeof UserDataForMigration.Type

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
  created_at: GelTimestamp.pipe(
    Schema.withDecodingDefaultKey(
      Effect.succeed(Schema.decodeUnknownSync(Schema.DateFromString)("2025-04-01T12:00:00Z")),
    ),
  ),
  updated_at: GelOptionalColumn(GelTimestamp),
  id: Schema.String,
  names: Schema.Array(Schema.String),
  description: GelOptionalColumn(Schema.Unknown), // json
  category: GelOptionalColumn(Schema.String),
  handle: Schema.String,
})
export type GelTag = typeof GelTag.Type

export const TagDataForMigration = Schema.Struct({
  latest_source: GelTag,
  id: TagId,
})
export type TagDataForMigration = typeof TagDataForMigration.Type

export const GelImage = Schema.Struct({
  ...gelEmbeddedAuditableFields,
  id: Schema.String,
  sanity_id: Schema.String,
  sources: Schema.optional(Schema.Array(GelSource)),
  label: GelOptionalColumn(Schema.String),
  hotspot: GelOptionalColumn(Schema.Unknown), // json
  crop: GelOptionalColumn(Schema.Unknown), // json
})
export type GelImage = typeof GelImage.Type

export const GelVegetableVariety = Schema.Struct({
  ...gelEmbeddedAuditableFields,
  id: Schema.String,
  names: Schema.Array(Schema.String),
  handle: Handle,
  photos: Schema.Array(GelImage),
})
export type GelVegetableVariety = typeof GelVegetableVariety.Type

export const GelVegetableTip = Schema.Struct({
  ...gelAuditableFields,
  id: Schema.String,
  subjects: Schema.Array(Enums.GelTipSubject),
  content: Schema.Unknown, // json
  handle: Handle,
})
export type GelVegetableTip = typeof GelVegetableTip.Type

export const GelVegetable = Schema.Struct({
  created_by_id: GelOptionalColumn(Schema.String),
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
  handle: Handle,
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
  published_at: GelTimestamp,
  types: Schema.Array(Enums.GelNoteType),
  title: GelTiptapDocument,
  body: GelOptionalColumn(GelTiptapDocument),
  content_plain_text: GelOptionalColumn(Schema.String),
  handle: Handle,
})
export type GelNote = typeof GelNote.Type

export const GelNoteWithRelations = Schema.Struct({
  ...GelNote.fields,
  created_by: Schema.NullOr(
    Schema.Struct({ id: Schema.String, handle: Handle, name: Schema.String }),
  ),
  related_to_vegetables: Schema.Array(
    Schema.Struct({ id: Schema.String, handle: Handle, names: Schema.Array(Schema.String) }),
  ),
  related_to_notes: Schema.Array(Schema.Struct({ id: Schema.String, handle: Handle })),
})
export type GelNoteWithRelations = typeof GelNoteWithRelations.Type

export const NoteDataForMigration = Schema.Struct({
  id: PublicationId,
  tagIds: Schema.Array(TagId),
  wikiArticleIds: Schema.Array(WikiArticleId),
  latest_source: GelNoteWithRelations,
  publication: Schema.NullOr(PostSourceData),
  conversion_error: Schema.NullOr(Schema.String),
})
export type NoteDataForMigration = typeof NoteDataForMigration.Type

export const GelEditSuggestion = Schema.Struct({
  ...gelAuditableFields,
  id: Schema.String,
  diff: Schema.Unknown, // json - json-diff-ts format
  snapshot: Schema.Unknown, // json
  status: Enums.GelEditSuggestionStatus,
  created_by_id: GelOptionalColumn(Schema.String),
  reviewed_by_id: GelOptionalColumn(Schema.String), // UserProfile.id
})
export type GelEditSuggestion = typeof GelEditSuggestion.Type

export const GelResource = Schema.Struct({
  ...gelAuditableFields,
  id: Schema.String,
  url: Schema.String,
  title: Schema.String,
  format: Enums.GelResourceFormat,
  description: GelOptionalColumn(GelTiptapDocument),
  credit_line: GelOptionalColumn(Schema.String),
  thumbnail: GelOptionalColumn(Schema.String), // Image.id
  handle: Handle,
})
export type GelResource = typeof GelResource.Type

const GelResourceRelation = Schema.Struct({ id: Schema.String })

export const GelResourceWithRelations = Schema.Struct({
  ...GelResource.fields,
  thumbnail: GelOptionalColumn(GelImage),
  created_by: GelOptionalColumn(GelResourceRelation),
  related_vegetables: Schema.Array(GelResourceRelation),
  tags: Schema.Array(GelResourceRelation),
})
export type GelResourceWithRelations = typeof GelResourceWithRelations.Type

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
