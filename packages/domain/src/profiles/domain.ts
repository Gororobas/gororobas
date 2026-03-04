/**
 * Profile domain entity - base for Person and Organization.
 */
import { Schema } from "effect"

import { ProfileType, ProfileVisibility } from "../common/enums.js"
import { ImageId, OrganizationId, PersonId } from "../common/ids.js"
import { Handle, TimestampedStruct } from "../common/primitives.js"
import { OrganizationRow } from "../organizations/domain.js"
import { TiptapDocument } from "../rich-text/domain.js"

const CoreProfileRow = Schema.Struct({
  ...TimestampedStruct.fields,
  bio: Schema.NullishOr(TiptapDocument),
  handle: Handle,
  location: Schema.NullishOr(Schema.String),
  name: Schema.NonEmptyTrimmedString,
  photoId: Schema.NullishOr(ImageId),
  visibility: ProfileVisibility,
})

const PersonProfileRow = Schema.Struct({
  ...CoreProfileRow.fields,
  id: PersonId,
  type: Schema.Literal("PERSON" satisfies (typeof ProfileType.literals)[0]),
})

export const OrganizationProfileRow = Schema.Struct({
  ...CoreProfileRow.fields,
  id: OrganizationId,
  type: Schema.Literal("ORGANIZATION" satisfies (typeof ProfileType.literals)[1]),
})

export const ProfileRow = Schema.Union(PersonProfileRow, OrganizationProfileRow)
export type ProfileRow = typeof ProfileRow.Type

export const ProfileRowUpdate = ProfileRow.pipe(
  Schema.omit("createdAt", "id", "type", "updatedAt"),
  Schema.partial,
)
export type ProfileRowUpdate = typeof ProfileRowUpdate.Type

export const OrganizationProfilePageData = Schema.Struct({
  ...OrganizationProfileRow.fields,
})
export type OrganizationProfilePageData = typeof OrganizationProfilePageData.Type

export const PersonProfilePageData = Schema.Struct({
  ...PersonProfileRow.fields,
})
export type PersonProfilePageData = typeof PersonProfilePageData.Type

export const ProfilePageData = Schema.Union(OrganizationProfilePageData, PersonProfilePageData)
export type ProfilePageData = typeof ProfilePageData.Type

export const ProfileMetadataResult = Schema.Struct({
  organization: Schema.NullishOr(OrganizationRow),
  profile: ProfileRow,
})
export type ProfileMetadataResult = typeof ProfileMetadataResult.Type

export const ProfileContentCounts = Schema.Struct({
  notes: Schema.Number,
  events: Schema.Number,
  vegetableBookmarks: Schema.Number,
  resourceBookmarks: Schema.Number,
  comments: Schema.Number,
  images: Schema.Number,
})
