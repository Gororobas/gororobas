/**
 * Person domain entity - represents a user account.
 */
import { Schema, Struct } from "effect"

import { PlatformAccessLevel, SupportedLanguage } from "../common/enums.js"
import { OrganizationId, PersonId } from "../common/ids.js"
import { Email, TimestampColumn } from "../common/primitives.js"
import { ProfileContentCounts } from "../profiles/domain.js"

export const PersonRow = Schema.Struct({
  accessLevel: PlatformAccessLevel,
  accessSetAt: Schema.NullOr(TimestampColumn),
  accessSetById: Schema.NullOr(PersonId),
  id: PersonId,
  /** The language Gororobas speaks to them in, on every device and in emails. */
  preferredLanguage: SupportedLanguage,
})

export type PersonRow = typeof PersonRow.Type

export const PersonRowUpdate = PersonRow.mapFields(({ id, ...fields }) => ({
  id,
  ...Struct.map(fields, Schema.optional),
}))
export type PersonRowUpdate = typeof PersonRowUpdate.Type

/** What a newly signed-in person tells us before they get a profile. */
export const OnboardingInput = Schema.Struct({
  // @todo perhaps add location & profile picture to the onboarding input?
  name: Schema.Trimmed.check(Schema.isMinLength(1), Schema.isMaxLength(128)),
  /** The language they signed up in. */
  preferredLanguage: SupportedLanguage,
})

export type OnboardingInput = typeof OnboardingInput.Type

/** What only the signed-in person sees about their own account. */
export const MyAccount = Schema.Struct({
  email: Email,
  preferredLanguage: SupportedLanguage,
})
export type MyAccount = typeof MyAccount.Type

export const MyAccountUpdate = Schema.Struct({ preferredLanguage: SupportedLanguage })
export type MyAccountUpdate = typeof MyAccountUpdate.Type

export const HandleAvailability = Schema.Struct({ isAvailable: Schema.Boolean })
export type HandleAvailability = typeof HandleAvailability.Type

export const AccountDeletionConfirmation = Schema.Struct({
  shouldDeleteOrgs: Schema.Boolean,
  shouldDeleteContent: Schema.Boolean,
})
export type AccountDeletionConfirmation = typeof AccountDeletionConfirmation.Type

export const SoleOrgManager = Schema.TaggedStruct("SoleOrgManager", {
  organizations: Schema.Array(OrganizationId),
})

/** The community must keep an administrator: hand over by promoting someone else to ADMIN first. */
export const LastAdministrator = Schema.TaggedStruct("LastAdministrator", {})

export const AccountDeletionErrorReason = Schema.Union([SoleOrgManager, LastAdministrator])
export type AccountDeletionErrorReason = typeof AccountDeletionErrorReason.Type

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
