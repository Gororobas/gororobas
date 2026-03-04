/**
 * Enum types for domain entities.
 * Using Schema.Literals for type-safe enum values.
 */
import { Schema } from "effect"

export const Locale = Schema.Literals(["pt", "es", "en"])
export type Locale = typeof Locale.Type

export const TrustedAccessLevel = Schema.Literals([
  "COMMUNITY", // Has been approved and has access to public & community content
  "MODERATOR", // Can trust or block newcomers, flag media and posts, and approve revisions
  "ADMIN", // Moderator access + manage other moderators and admins
])
export type TrustedAccessLevel = typeof TrustedAccessLevel.Type

export const PlatformAccessLevel = Schema.Literals([
  ...TrustedAccessLevel.literals,
  "NEWCOMER", // Just signed up, limited access
  "BLOCKED", // Has been blocked by a moderator or admin, same access as visitors
])
export type PlatformAccessLevel = typeof PlatformAccessLevel.Type

export const PlatformAccessLevelOrVisitor = Schema.Literals([
  ...PlatformAccessLevel.literals,
  "VISITOR",
])
export type PlatformAccessLevelOrVisitor = typeof PlatformAccessLevelOrVisitor.Type

export const ModerationStatus = Schema.Literals(["APPROVED_BY_DEFAULT", "CENSORED"])
export type ModerationStatus = typeof ModerationStatus.Type

export const ProfileType = Schema.Literals(["PERSON", "ORGANIZATION"])
export type ProfileType = typeof ProfileType.Type

export const OrganizationInvitationStatus = Schema.Literals(["PENDING", "ACCEPTED", "EXPIRED"])
export type OrganizationInvitationStatus = typeof OrganizationInvitationStatus.Type

export const OrganizationAccessLevel = Schema.Literals(["MANAGER", "EDITOR", "VIEWER"])
export type OrganizationAccessLevel = typeof OrganizationAccessLevel.Type

// @TODO review organization types
export const OrganizationType = Schema.Literals([
  "TERRITORY",
  "SOCIAL_MOVEMENT",
  "COMMERCIAL",
  "NGO",
])
export type OrganizationType = typeof OrganizationType.Type

/** Profiles can't be private */
export const ProfileVisibility = Schema.Literals(["COMMUNITY", "PUBLIC"])
export type ProfileVisibility = typeof ProfileVisibility.Type

export const InformationVisibility = Schema.Literals(["PRIVATE", "COMMUNITY", "PUBLIC"])
export type InformationVisibility = typeof InformationVisibility.Type

export const RevisionEvaluation = Schema.Literals(["PENDING", "APPROVED", "REJECTED"])
export type RevisionEvaluation = typeof RevisionEvaluation.Type

/** Inspired by https://schema.org/EventAttendanceModeEnumeration */
export const EventAttendanceMode = Schema.Literals(["IN_PERSON", "VIRTUAL", "MIXED"])
export type EventAttendanceMode = typeof EventAttendanceMode.Type

export const BookmarkState = Schema.Literals([
  "INTERESTED", // "Want to plant" for vegetables
  "ACTIVE", // "Am planting" for vegetables
  "PREVIOUSLY_ACTIVE", // "Have planted" for vegetables
  "INDIFFERENT", // "Not interested"
])
export type BookmarkState = typeof BookmarkState.Type

export const PostKind = Schema.Literals(["NOTE", "EVENT"])
export type PostKind = typeof PostKind.Type

export const AgroforestryStratum = Schema.Literals(["EMERGENT", "HIGH", "MEDIUM", "LOW", "GROUND"])
export type AgroforestryStratum = typeof AgroforestryStratum.Type

export const VegetableLifecycle = Schema.Literals(["SEMIANNUAL", "ANNUAL", "BIENNIAL", "PERENNIAL"])
export type VegetableLifecycle = typeof VegetableLifecycle.Type

export const VegetableUsage = Schema.Literals([
  "HUMAN_FEED",
  "ANIMAL_FEED",
  "CONSTRUCTION",
  "COSMETIC",
  "ORGANIC_MATTER",
  "MEDICINAL",
  "ORNAMENTAL",
  "RITUALISTIC",
  "ECOSYSTEM_SERVICE",
])
export type VegetableUsage = typeof VegetableUsage.Type

export const EdibleVegetablePart = Schema.Literals([
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
])
export type EdibleVegetablePart = typeof EdibleVegetablePart.Type

export const PlantingMethod = Schema.Literals([
  "SEED",
  "SEEDLING",
  "STEM_CUTTING",
  "RHIZOME",
  "TUBER",
  "GRAFT",
  "BULB",
  "DIVISION",
])
export type PlantingMethod = typeof PlantingMethod.Type

export const GrammaticalGender = Schema.Literals(["NEUTRAL", "MALE", "FEMALE"])
export type GrammaticalGender = typeof GrammaticalGender.Type

export const ChineseMedicineElement = Schema.Literals(["FIRE", "EARTH", "METAL", "WATER", "WOOD"])
export type ChineseMedicineElement = typeof ChineseMedicineElement.Type

export const ResourceUrlState = Schema.Literals(["UNCHECKED", "OK", "BROKEN", "PENDING"])
export type ResourceUrlState = typeof ResourceUrlState.Type

export const ResourceFormat = Schema.Literals([
  "PDF",
  "VIDEO",
  "IMAGE",
  "WEBSITE",
  "ARTICLE",
  "BOOK",
  "OTHER",
])
export type ResourceFormat = typeof ResourceFormat.Type

export const TranslationSource = Schema.Literals(["ORIGINAL", "AUTOMATIC", "MANUAL"])
export type TranslationSource = typeof TranslationSource.Type

export const SuggestedTagStatus = Schema.Literals(["PENDING", "APPROVED", "REJECTED"])
export type SuggestedTagStatus = typeof SuggestedTagStatus.Type
