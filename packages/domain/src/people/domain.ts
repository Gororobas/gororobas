/**
 * Person domain entity - represents a user account.
 */
import { Schema } from "effect"

import { PlatformAccessLevel } from "../common/enums.js"
import { OrganizationId, PersonId } from "../common/ids.js"
import { TimestampColumn } from "../common/primitives.js"
import { ProfileContentCounts } from "../profiles/domain.js"

export const PersonRow = Schema.Struct({
  accessLevel: PlatformAccessLevel,
  accessSetAt: Schema.NullishOr(TimestampColumn),
  accessSetById: Schema.NullishOr(PersonId),
  id: PersonId,
})
export type PersonRow = typeof PersonRow.Type

export const AccountDeletionConfirmation = Schema.Struct({
  deleteOrgs: Schema.Boolean,
  deleteContent: Schema.Boolean,
})
export type AccountDeletionConfirmation = typeof AccountDeletionConfirmation.Type

export const AccountDeletionErrorReason = Schema.TaggedStruct("SoleOrgManager", {
  organizations: Schema.Array(OrganizationId),
})

export const AccountDeletionResultSuccess = Schema.TaggedStruct("Success", {})

export const AccountDeletionResultConfirmOrgDeletion = Schema.TaggedStruct("ConfirmOrgDeletion", {
  organizations: Schema.Array(OrganizationId),
})

export const OrganizationContentCount = Schema.Struct({
  organizationId: OrganizationId,
  contentCount: ProfileContentCounts,
})

export const AccountDeletionResultConfirmContentDeletion = Schema.TaggedStruct(
  "ConfirmContentDeletion",
  {
    personalContentCount: ProfileContentCounts,
    organizationContent: Schema.Array(OrganizationContentCount),
  },
)

export const AccountDeletionResult = Schema.Union([
  AccountDeletionResultSuccess,
  AccountDeletionResultConfirmOrgDeletion,
  AccountDeletionResultConfirmContentDeletion,
])

export const SoleManagerOrganizationMetadata = Schema.Struct({
  organizationId: OrganizationId,
  memberCount: Schema.Int,
})
