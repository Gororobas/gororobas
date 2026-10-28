/**
 * Profile domain entity - base for Person and Organization.
 */
import { Schema, Struct } from "effect"

import { ProfileType, ProfileVisibility } from "../common/enums.js"
import { MediaAssetId, OrganizationId, PersonId, ProfileId } from "../common/ids.js"
import { Handle, TimestampedStruct } from "../common/primitives.js"
import { toSearchableText } from "../common/utils/strings.js"
import { OrganizationRow } from "../organizations/domain.js"
import { TiptapDocument } from "../rich-text/domain.js"

export const ProfileSearchParams = Schema.Struct({
  text: Schema.optional(Schema.Trimmed.check(Schema.isNonEmpty())),
  type: Schema.optional(ProfileType),
})
export type ProfileSearchParams = typeof ProfileSearchParams.Type

/** What profile search matches, stored in `profiles.searchable_text` whenever these fields change. */
export const profileSearchableText = (profile: {
  readonly name: string
  readonly handle: string
  readonly location: string | null
}) => toSearchableText([profile.name, profile.handle, profile.location ?? ""].join(" "))

export const ProfileCardData = Schema.Struct({
  id: ProfileId,
  type: ProfileType,
  handle: Handle,
  name: Schema.String,
  location: Schema.NullOr(Schema.String),
  photoId: Schema.NullOr(MediaAssetId),
})

export type ProfileCardData = typeof ProfileCardData.Type

const CoreProfileRow = Schema.Struct({
  ...TimestampedStruct.fields,
  bio: Schema.NullOr(Schema.fromJsonString(TiptapDocument)),
  handle: Handle,
  location: Schema.NullOr(Schema.Trimmed.check(Schema.isNonEmpty())),
  name: Schema.Trimmed.check(Schema.isNonEmpty()),
  photoId: Schema.NullOr(MediaAssetId),
  visibility: ProfileVisibility,
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

export const OrganizationProfilePageData = Schema.Struct({
  ...OrganizationProfileRow.fields,
})
export type OrganizationProfilePageData = typeof OrganizationProfilePageData.Type

export const PersonProfilePageData = Schema.Struct({
  ...PersonProfileRow.fields,
})
export type PersonProfilePageData = typeof PersonProfilePageData.Type

export const ProfilePageData = Schema.Union([OrganizationProfilePageData, PersonProfilePageData])
export type ProfilePageData = typeof ProfilePageData.Type

export const ProfileMetadataResult = Schema.Struct({
  organization: Schema.NullOr(OrganizationRow),
  profile: ProfileRow,
})
export type ProfileMetadataResult = typeof ProfileMetadataResult.Type

export const ProfileContentCounts = Schema.Struct({
  posts: Schema.Number,
  events: Schema.Number,
  wikiArticleBookmarks: Schema.Number,
  publicationComments: Schema.Number,
  images: Schema.Number,
})
