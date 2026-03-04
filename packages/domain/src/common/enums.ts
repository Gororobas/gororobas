/**
 * Enum types for domain entities.
 * Using Schema.Literal for type-safe enum values.
 */
import { Schema } from "effect"

export const Locale = Schema.Literal("pt", "es", "en")
export type Locale = typeof Locale.Type

export const TrustedAccessLevel = Schema.Literal(
  "COMMUNITY", // Has been approved and has access to public & community content
  "MODERATOR", // Can trust or block newcomers, flag media and posts, and approve revisions
  "ADMIN", // Moderator access + manage other moderators and admins
)
export type TrustedAccessLevel = typeof TrustedAccessLevel.Type

export const PlatformAccessLevel = Schema.Literal(
  ...TrustedAccessLevel.literals,
  "NEWCOMER", // Just signed up, limited access
  "BLOCKED", // Has been blocked by a moderator or admin, same access as visitors
)
export type PlatformAccessLevel = typeof PlatformAccessLevel.Type

export const PlatformAccessLevelOrVisitor = Schema.Literal(
  ...PlatformAccessLevel.literals,
  "VISITOR",
)
export type PlatformAccessLevelOrVisitor = typeof PlatformAccessLevelOrVisitor.Type

export const ModerationStatus = Schema.Literal("APPROVED_BY_DEFAULT", "CENSORED")
export type ModerationStatus = typeof ModerationStatus.Type

export const ProfileType = Schema.Literal("PERSON", "ORGANIZATION")
export type ProfileType = typeof ProfileType.Type

export const OrganizationInvitationStatus = Schema.Literal("PENDING", "ACCEPTED", "EXPIRED")
export type OrganizationInvitationStatus = typeof OrganizationInvitationStatus.Type

export const OrganizationAccessLevel = Schema.Literal("MANAGER", "EDITOR", "VIEWER")
export type OrganizationAccessLevel = typeof OrganizationAccessLevel.Type

// @TODO review organization types
export const OrganizationType = Schema.Literal("TERRITORY", "SOCIAL_MOVEMENT", "COMMERCIAL", "NGO")
export type OrganizationType = typeof OrganizationType.Type

/** Profiles can't be private */
export const ProfileVisibility = Schema.Literal("COMMUNITY", "PUBLIC")
export type ProfileVisibility = typeof ProfileVisibility.Type

export const InformationVisibility = Schema.Literal("PRIVATE", "COMMUNITY", "PUBLIC")
export type InformationVisibility = typeof InformationVisibility.Type

export const RevisionEvaluation = Schema.Literal("PENDING", "APPROVED", "REJECTED")
export type RevisionEvaluation = typeof RevisionEvaluation.Type

/** Inspired by https://schema.org/EventAttendanceModeEnumeration */
export const EventAttendanceMode = Schema.Literal("IN_PERSON", "VIRTUAL", "MIXED")
export type EventAttendanceMode = typeof EventAttendanceMode.Type

export const BookmarkState = Schema.Literal(
  "INTERESTED", // "Want to plant" for vegetables
  "ACTIVE", // "Am planting" for vegetables
  "PREVIOUSLY_ACTIVE", // "Have planted" for vegetables
  "INDIFFERENT", // "Not interested"
)
export type BookmarkState = typeof BookmarkState.Type

export const PostKind = Schema.Literal("NOTE", "EVENT")
export type PostKind = typeof PostKind.Type

export const AgroforestryStratum = Schema.Literal("EMERGENT", "HIGH", "MEDIUM", "LOW", "GROUND")
export type AgroforestryStratum = typeof AgroforestryStratum.Type

export const VegetableLifecycle = Schema.Literal("SEMIANNUAL", "ANNUAL", "BIENNIAL", "PERENNIAL")
export type VegetableLifecycle = typeof VegetableLifecycle.Type

export const VegetableUsage = Schema.Literal(
  "HUMAN_FEED",
  "ANIMAL_FEED",
  "CONSTRUCTION",
  "COSMETIC",
  "ORGANIC_MATTER",
  "MEDICINAL",
  "ORNAMENTAL",
  "RITUALISTIC",
  "ECOSYSTEM_SERVICE",
)
export type VegetableUsage = typeof VegetableUsage.Type

export const EdibleVegetablePart = Schema.Literal(
  "FRUIT",
  "FLOWER",
  "LEAF",
  "STEM",
  "SEED",
  "BARK",
  "BULB",
  "SPROUT",
  "ROOT",
  "TUBER",
  "RHIZOME",
)
export type EdibleVegetablePart = typeof EdibleVegetablePart.Type

export const PlantingMethod = Schema.Literal(
  "SEED",
  "SEEDLING",
  "STEM_CUTTING",
  "RHIZOME",
  "TUBER",
  "GRAFT",
  "BULB",
  "DIVISION",
)
export type PlantingMethod = typeof PlantingMethod.Type

export const GrammaticalGender = Schema.Literal("NEUTRAL", "MALE", "FEMALE")
export type GrammaticalGender = typeof GrammaticalGender.Type

export const ChineseMedicineElement = Schema.Literal("FIRE", "EARTH", "METAL", "WATER", "WOOD")
export type ChineseMedicineElement = typeof ChineseMedicineElement.Type

export const ResourceUrlState = Schema.Literal("UNCHECKED", "OK", "BROKEN", "PENDING")
export type ResourceUrlState = typeof ResourceUrlState.Type

export const ResourceFormat = Schema.Literal(
  "PDF",
  "VIDEO",
  "IMAGE",
  "WEBSITE",
  "ARTICLE",
  "BOOK",
  "OTHER",
)
export type ResourceFormat = typeof ResourceFormat.Type

export const TranslationSource = Schema.Literal("ORIGINAL", "AUTOMATIC", "MANUAL")
export type TranslationSource = typeof TranslationSource.Type

export const SuggestedTagStatus = Schema.Literal("PENDING", "APPROVED", "REJECTED")
export type SuggestedTagStatus = typeof SuggestedTagStatus.Type
