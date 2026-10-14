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
  accessSetAt: Schema.NullOr(TimestampColumn),
  accessSetById: Schema.NullOr(PersonId),
  id: PersonId,
})

export type PersonRow = typeof PersonRow.Type

/** What a newly signed-in person tells us before they get a profile. */
export const OnboardingInput = Schema.Struct({
  // @todo perhaps add location & profile picture to the onboarding input?
  name: Schema.Trimmed.check(Schema.isMinLength(1), Schema.isMaxLength(128)),
})
export type OnboardingInput = typeof OnboardingInput.Type

export const AccountDeletionConfirmation = Schema.Struct({
  shouldDeleteOrgs: Schema.Boolean,
  shouldDeleteContent: Schema.Boolean,
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
