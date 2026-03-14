/**
 * ID type definitions with branding for type safety.
 */
import { Schema } from "effect"

const UUID = Schema.String.check(
  Schema.isUUID(7),
  // For some reason, isUUID accepts uppercased IDs, which somehow break SQLite updates
  Schema.isLowercased(),
).annotate({
  toArbitrary: () => (fc) => fc.uuid({ version: [7] }),
})

export const AccountId = UUID.pipe(Schema.brand("AccountId"))
export type AccountId = typeof AccountId.Type

export const SessionId = UUID.pipe(Schema.brand("SessionId"))
export type SessionId = typeof SessionId.Type

export const OAuthAccountId = UUID.pipe(Schema.brand("OAuthAccountId"))
export type OAuthAccountId = typeof OAuthAccountId.Type

export const VerificationId = UUID.pipe(Schema.brand("VerificationId"))
export type VerificationId = typeof VerificationId.Type

export const CommentId = UUID.pipe(Schema.brand("CommentId"))
export type CommentId = typeof CommentId.Type

export const CommentCommitId = UUID.pipe(Schema.brand("CommentCommitId"))
export type CommentCommitId = typeof CommentCommitId.Type

export const ImageId = UUID.pipe(Schema.brand("ImageId"))
export type ImageId = typeof ImageId.Type

export const ProfileId = UUID.pipe(Schema.brand("ProfileId"))
export type ProfileId = typeof ProfileId.Type

export const OrganizationId = ProfileId.pipe(Schema.brand("OrganizationId"))
export type OrganizationId = typeof OrganizationId.Type

export const PersonId = ProfileId.pipe(Schema.brand("PersonId"))
export type PersonId = typeof PersonId.Type

export const PostId = UUID.pipe(Schema.brand("PostId"))
export type PostId = typeof PostId.Type

export const NoteId = PostId.pipe(Schema.brand("NoteId"))
export type NoteId = typeof NoteId.Type

export const EventId = PostId.pipe(Schema.brand("EventId"))
export type EventId = typeof EventId.Type

export const PostCommitId = UUID.pipe(Schema.brand("PostCommitId"))
export type PostCommitId = typeof PostCommitId.Type

export const ResourceId = UUID.pipe(Schema.brand("ResourceId"))
export type ResourceId = typeof ResourceId.Type

export const ResourceRevisionId = UUID.pipe(Schema.brand("ResourceRevisionId"))
export type ResourceRevisionId = typeof ResourceRevisionId.Type

export const TagId = UUID.pipe(Schema.brand("TagId"))
export type TagId = typeof TagId.Type

export const SuggestedTagId = UUID.pipe(Schema.brand("SuggestedTagId"))
export type SuggestedTagId = typeof SuggestedTagId.Type

export const VegetableId = UUID.pipe(Schema.brand("VegetableId"))
export type VegetableId = typeof VegetableId.Type

export const VegetableRevisionId = UUID.pipe(Schema.brand("VegetableRevisionId"))
export type VegetableRevisionId = typeof VegetableRevisionId.Type

export const VegetableVarietyId = UUID.pipe(Schema.brand("VegetableVarietyId"))
export type VegetableVarietyId = typeof VegetableVarietyId.Type
