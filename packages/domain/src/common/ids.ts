/**
 * ID type definitions with branding for type safety.
 */
import { Schema } from "effect"

export const AccountId = Schema.UUID.pipe(Schema.brand("AccountId"))
export type AccountId = typeof AccountId.Type

export const SessionId = Schema.UUID.pipe(Schema.brand("SessionId"))
export type SessionId = typeof SessionId.Type

export const OAuthAccountId = Schema.UUID.pipe(Schema.brand("OAuthAccountId"))
export type OAuthAccountId = typeof OAuthAccountId.Type

export const VerificationId = Schema.UUID.pipe(Schema.brand("VerificationId"))
export type VerificationId = typeof VerificationId.Type

export const CommentId = Schema.UUID.pipe(Schema.brand("CommentId"))
export type CommentId = typeof CommentId.Type

export const ImageId = Schema.UUID.pipe(Schema.brand("ImageId"))
export type ImageId = typeof ImageId.Type

export const ProfileId = Schema.UUID.pipe(Schema.brand("ProfileId"))
export type ProfileId = typeof ProfileId.Type

export const OrganizationId = ProfileId.pipe(Schema.brand("OrganizationId"))
export type OrganizationId = typeof OrganizationId.Type

export const PersonId = ProfileId.pipe(Schema.brand("PersonId"))
export type PersonId = typeof PersonId.Type

export const PostId = Schema.UUID.pipe(Schema.brand("PostId"))
export type PostId = typeof PostId.Type

export const NoteId = PostId.pipe(Schema.brand("NoteId"))
export type NoteId = typeof NoteId.Type

export const EventId = PostId.pipe(Schema.brand("EventId"))
export type EventId = typeof EventId.Type

export const PostCommitId = Schema.UUID.pipe(Schema.brand("PostCommitId"))
export type PostCommitId = typeof PostCommitId.Type

export const ResourceId = Schema.UUID.pipe(Schema.brand("ResourceId"))
export type ResourceId = typeof ResourceId.Type

export const ResourceRevisionId = Schema.UUID.pipe(Schema.brand("ResourceRevisionId"))
export type ResourceRevisionId = typeof ResourceRevisionId.Type

export const TagId = Schema.UUID.pipe(Schema.brand("TagId"))
export type TagId = typeof TagId.Type

export const SuggestedTagId = Schema.UUID.pipe(Schema.brand("SuggestedTagId"))
export type SuggestedTagId = typeof SuggestedTagId.Type

export const VegetableId = Schema.UUID.pipe(Schema.brand("VegetableId"))
export type VegetableId = typeof VegetableId.Type

export const VegetableRevisionId = Schema.UUID.pipe(Schema.brand("VegetableRevisionId"))
export type VegetableRevisionId = typeof VegetableRevisionId.Type

export const VegetableVarietyId = Schema.UUID.pipe(Schema.brand("VegetableVarietyId"))
export type VegetableVarietyId = typeof VegetableVarietyId.Type
