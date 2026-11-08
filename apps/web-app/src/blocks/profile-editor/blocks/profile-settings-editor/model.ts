import { OrganizationId } from "@gororobas/domain/common/ids"
import {
  AccountDeletionScope,
  MyAccount,
  OrganizationToDelete,
} from "@gororobas/domain/people/domain"
import { PersonProfileRow } from "@gororobas/domain/profiles/domain"
import { Schema } from "effect"
import { AsyncData } from "foldkit"
import { defineTaggedUnion } from "foldkit/schema"

import { ClientFailure } from "../../../../lib/client-failure"

export const Profile = AsyncData.Schema(PersonProfileRow, ClientFailure)
export const Account = AsyncData.Schema(MyAccount, ClientFailure)

/** Each setting saves as soon as it's chosen. */
export const Setting = Schema.Literals(["ProfileVisibility", "BookmarksVisibility", "Language"])
export type Setting = typeof Setting.Type

export const SettingSave = defineTaggedUnion({
  Idle: {},
  Saving: { setting: Setting },
  Saved: { setting: Setting },
  Failed: { setting: Setting },
})

export type SettingSave = typeof SettingSave.Type

/** Why the account can't be deleted as it is. */
export const DeletionBlocker = Schema.Literals([
  "SoleOrganizationManager",
  "LastAdministrator",
  "RequestFailed",
])

export type DeletionBlocker = typeof DeletionBlocker.Type

/**
 * Deleting asks twice before anything happens: first about organizations they're the only member
 * of, then about everything they've shared.
 */
export const AccountDeletion = defineTaggedUnion({
  Idle: {},
  /** `organizationIds`: the organizations they've agreed to delete so far. */
  Asking: { organizationIds: Schema.Array(OrganizationId) },
  /** `hasChanged`: they had confirmed, but the server found something they hadn't reviewed. */
  ConfirmingOrganizations: {
    organizations: Schema.Array(OrganizationToDelete),
    hasChanged: Schema.Boolean,
  },
  ConfirmingContent: { scope: AccountDeletionScope, hasChanged: Schema.Boolean },
  /** Confirming exactly `scope`, which the server deletes only if it's still what it finds. */
  Deleting: { scope: AccountDeletionScope },
  Blocked: { blocker: DeletionBlocker },
})

export type AccountDeletion = typeof AccountDeletion.Type

export const Model = Schema.Struct({
  profile: Profile.schema,
  account: Account.schema,
  /** Bumped after a failed save, so what's shown matches what's stored. */
  reloadCount: Schema.Int,
  save: SettingSave,
  deletion: AccountDeletion,
})

export type Model = typeof Model.Type
