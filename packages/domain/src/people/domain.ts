/**
 * Person domain entity - represents a user account.
 */
import { HashSet, Schema, Struct } from "effect"

import { PlatformAccessLevel, SupportedLanguage } from "../common/enums.js"
import { OrganizationId, PersonId } from "../common/ids.js"
import { Email, Handle, TimestampColumn } from "../common/primitives.js"
import { ProfileContent } from "../profiles/domain.js"

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

export const SoleOrgManager = Schema.TaggedStruct("SoleOrgManager", {
  organizations: Schema.Array(OrganizationId),
})

/** The community must keep an administrator: hand over by promoting someone else to ADMIN first. */
export const LastAdministrator = Schema.TaggedStruct("LastAdministrator", {})

export const AccountDeletionErrorReason = Schema.Union([SoleOrgManager, LastAdministrator])
export type AccountDeletionErrorReason = typeof AccountDeletionErrorReason.Type

export const AccountDeletionResultSuccess = Schema.TaggedStruct("Success", {})

/** An organization that would be deleted with its sole member's account. */
export const OrganizationToDelete = Schema.Struct({
  organizationId: OrganizationId,
  name: Schema.String,
  handle: Handle,
})

export type OrganizationToDelete = typeof OrganizationToDelete.Type

export const AccountDeletionResultConfirmOrgDeletion = Schema.TaggedStruct("ConfirmOrgDeletion", {
  organizations: Schema.Array(OrganizationToDelete),
})

export const OrganizationDeletionScope = Schema.Struct({
  ...OrganizationToDelete.fields,
  content: ProfileContent,
})
export type OrganizationDeletionScope = typeof OrganizationDeletionScope.Type

/** Everything deleting an account removes: its own content and its organizations'. */
export const AccountDeletionScope = Schema.Struct({
  personalContent: ProfileContent,
  organizations: Schema.Array(OrganizationDeletionScope),
})
export type AccountDeletionScope = typeof AccountDeletionScope.Type

export const AccountDeletionResultConfirmContentDeletion = Schema.TaggedStruct(
  "ConfirmContentDeletion",
  AccountDeletionScope.fields,
)

/**
 * What the person reviewed before confirming. The server deletes only if it still finds exactly
 * this, and asks again otherwise.
 */
export const AccountDeletionConfirmation = Schema.Struct({
  /** The organizations they agreed to delete with their account, from `ConfirmOrgDeletion`. */
  organizationIds: Schema.Array(OrganizationId),
  /** Everything they agreed to delete, from `ConfirmContentDeletion`, once they've seen it. */
  scope: Schema.optional(AccountDeletionScope),
})

export type AccountDeletionConfirmation = typeof AccountDeletionConfirmation.Type

const isSameIdSet = (a: ReadonlyArray<string>, b: ReadonlyArray<string>) => {
  const ids = HashSet.fromIterable(a)
  return (
    HashSet.size(ids) === HashSet.size(HashSet.fromIterable(b)) &&
    b.every((id) => HashSet.has(ids, id))
  )
}

const isSameContent = (a: ProfileContent, b: ProfileContent) =>
  isSameIdSet(a.postIds, b.postIds) &&
  isSameIdSet(a.eventIds, b.eventIds) &&
  isSameIdSet(a.wikiArticleBookmarkIds, b.wikiArticleBookmarkIds) &&
  isSameIdSet(a.publicationCommentIds, b.publicationCommentIds) &&
  isSameIdSet(a.imageIds, b.imageIds)

export const isSameOrganizationSet = (
  organizationIds: ReadonlyArray<OrganizationId>,
  organizations: ReadonlyArray<OrganizationToDelete>,
) =>
  isSameIdSet(
    organizationIds,
    organizations.map(({ organizationId }) => organizationId),
  )

/** Whether two scopes delete the same things, in any order. Names don't count: IDs do. */
export const isSameAccountDeletionScope = (a: AccountDeletionScope, b: AccountDeletionScope) =>
  isSameContent(a.personalContent, b.personalContent) &&
  isSameOrganizationSet(
    a.organizations.map(({ organizationId }) => organizationId),
    b.organizations,
  ) &&
  a.organizations.every((reviewed) =>
    b.organizations.some(
      (current) =>
        current.organizationId === reviewed.organizationId &&
        isSameContent(current.content, reviewed.content),
    ),
  )

export const AccountDeletionResult = Schema.Union([
  AccountDeletionResultSuccess,
  AccountDeletionResultConfirmOrgDeletion,
  AccountDeletionResultConfirmContentDeletion,
])

export const SoleManagerOrganizationMetadata = Schema.Struct({
  ...OrganizationToDelete.fields,
  memberCount: Schema.Int,
})
