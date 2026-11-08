/**
 * Profile domain entity - base for Person and Organization.
 */
import { Schema, Struct } from "effect"

import { InformationVisibility, ProfileType, ProfileVisibility } from "../common/enums.js"
import {
  MediaAssetId,
  OrganizationId,
  PersonId,
  ProfileId,
  PublicationCommentId,
  PublicationId,
  WikiArticleId,
} from "../common/ids.js"
import { Handle, TimestampedStruct } from "../common/primitives.js"
import { toSearchableText } from "../common/utils/strings.js"
import { OrganizationRow } from "../organizations/domain.js"
import { TiptapDocument } from "../rich-text/domain.js"
import { WikiArticleKind } from "../wiki/wiki-article.js"
import { ProfileLocationCardData } from "./locations.js"

export const ProfileSearchParams = Schema.Struct({
  text: Schema.optional(Schema.Trimmed.check(Schema.isNonEmpty())),
  type: Schema.optional(ProfileType),
})
export type ProfileSearchParams = typeof ProfileSearchParams.Type

/**
 * What profile search matches, stored in `profiles.searchable_text` whenever these fields change.
 * Only a public latest location is searchable: anyone can search profiles.
 */
export const profileSearchableText = (profile: {
  readonly name: string
  readonly handle: string
  readonly publicLocationText: string | null
}) => toSearchableText([profile.name, profile.handle, profile.publicLocationText ?? ""].join(" "))

export const ProfileCardData = Schema.Struct({
  id: ProfileId,
  type: ProfileType,
  handle: Handle,
  name: Schema.String,
  /** The profile's latest location, when the reader may see it. */
  location: Schema.NullOr(ProfileLocationCardData),
  photoId: Schema.NullOr(MediaAssetId),
})

export type ProfileCardData = typeof ProfileCardData.Type

/**
 * Stands in for a profile the reader may not see (`profilePolicies.canRead`), where content it
 * owns appears: people with community-only profiles can still publish publicly, without their name.
 */
export const HiddenProfile = Schema.TaggedStruct("HiddenProfile", {})
export type HiddenProfile = typeof HiddenProfile.Type

export const isHiddenProfile = (
  profile: ProfileCardData | HiddenProfile,
): profile is HiddenProfile => "_tag" in profile

const CoreProfileRow = Schema.Struct({
  ...TimestampedStruct.fields,
  bio: Schema.NullOr(Schema.fromJsonString(TiptapDocument)),
  handle: Handle,
  name: Schema.Trimmed.check(Schema.isNonEmpty()),
  photoId: Schema.NullOr(MediaAssetId),
  visibility: ProfileVisibility,
  /** Who sees the wiki articles the profile saved, and how it relates to them. */
  bookmarksVisibility: InformationVisibility,
})

export const PersonProfileRow = Schema.Struct({
  ...CoreProfileRow.fields,
  id: PersonId,
  type: Schema.Literal("PERSON" satisfies (typeof ProfileType.literals)[0]),
})

export const OrganizationProfileRow = Schema.Struct({
  ...CoreProfileRow.fields,
  id: OrganizationId,
  type: Schema.Literal("ORGANIZATION" satisfies (typeof ProfileType.literals)[1]),
})

export const ProfileRow = Schema.Union([PersonProfileRow, OrganizationProfileRow])
export type ProfileRow = typeof ProfileRow.Type

export const ProfileRowUpdate = CoreProfileRow.mapFields(
  Struct.omit(["createdAt", "updatedAt"]),
).mapFields(Struct.map(Schema.optional))

export type ProfileRowUpdate = typeof ProfileRowUpdate.Type

const pageFields = {
  /** The profile's latest location, when the reader may see it. */
  location: Schema.NullOr(ProfileLocationCardData),
  /** Whether the reader may see what the profile saved; when not, its page doesn't mention it. */
  areBookmarksVisible: Schema.Boolean,
  /** The kinds of article it saved, for filtering them; empty when the reader can't see them. */
  bookmarkedKinds: Schema.Array(WikiArticleKind),
}

export const OrganizationProfilePageData = Schema.Struct({
  ...OrganizationProfileRow.fields,
  ...pageFields,
})
export type OrganizationProfilePageData = typeof OrganizationProfilePageData.Type

export const PersonProfilePageData = Schema.Struct({
  ...PersonProfileRow.fields,
  ...pageFields,
})
export type PersonProfilePageData = typeof PersonProfilePageData.Type

export const ProfilePageData = Schema.Union([OrganizationProfilePageData, PersonProfilePageData])
export type ProfilePageData = typeof ProfilePageData.Type

export const ProfileMetadataResult = Schema.Struct({
  organization: Schema.NullOr(OrganizationRow),
  profile: ProfileRow,
})
export type ProfileMetadataResult = typeof ProfileMetadataResult.Type

/**
 * What deleting a profile removes, by ID. Deletion confirmations name exactly this, so nothing
 * created after someone reviewed it is deleted under their confirmation.
 */
export const ProfileContent = Schema.Struct({
  postIds: Schema.Array(PublicationId),
  eventIds: Schema.Array(PublicationId),
  wikiArticleBookmarkIds: Schema.Array(WikiArticleId),
  publicationCommentIds: Schema.Array(PublicationCommentId),
  imageIds: Schema.Array(MediaAssetId),
})

export type ProfileContent = typeof ProfileContent.Type

export const ProfileContentCounts = Schema.Struct({
  posts: Schema.Finite,
  events: Schema.Finite,
  wikiArticleBookmarks: Schema.Finite,
  publicationComments: Schema.Finite,
  images: Schema.Finite,
})

export type ProfileContentCounts = typeof ProfileContentCounts.Type

export const countProfileContent = (content: ProfileContent): ProfileContentCounts => ({
  posts: content.postIds.length,
  events: content.eventIds.length,
  wikiArticleBookmarks: content.wikiArticleBookmarkIds.length,
  publicationComments: content.publicationCommentIds.length,
  images: content.imageIds.length,
})
