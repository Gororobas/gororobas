/**
 * Organization domain entity and related types.
 */
import { Schema } from "effect"

import {
  InformationVisibility,
  OrganizationAccessLevel,
  OrganizationType,
  OrganizationInvitationStatus,
} from "../common/enums.js"
import { OrganizationId, OrganizationInvitationId, PersonId } from "../common/ids.js"
import { Email, Handle, TimestampedStruct } from "../common/primitives.js"

export const OrganizationRow = Schema.Struct({
  id: OrganizationId,
  membersVisibility: InformationVisibility,
  type: OrganizationType,
})

export type OrganizationRow = typeof OrganizationRow.Type

export const OrganizationMembershipRow = Schema.Struct({
  ...TimestampedStruct.fields,
  accessLevel: Schema.NullOr(OrganizationAccessLevel),
  organizationId: OrganizationId,
  personId: Schema.NullOr(PersonId),
})

export type OrganizationMembershipRow = typeof OrganizationMembershipRow.Type

export const OrganizationMembershipData = Schema.Struct({
  accessLevel: OrganizationAccessLevel,
  organizationId: OrganizationId,
  personId: PersonId,
})

export type OrganizationMembershipData = typeof OrganizationMembershipData.Type

export const CreateOrganizationData = Schema.Struct({
  handle: Handle,
  name: Schema.Trimmed.check(Schema.isNonEmpty()),
  type: OrganizationType,
})

export type CreateOrganizationData = typeof CreateOrganizationData.Type

export const UpdateOrganizationData = Schema.Struct({
  membersVisibility: Schema.optional(InformationVisibility),
  name: Schema.optional(Schema.Trimmed.check(Schema.isNonEmpty())),
})
export type UpdateOrganizationData = typeof UpdateOrganizationData.Type

export const OrganizationInvitationRow = Schema.Struct({
  ...TimestampedStruct.fields,
  id: OrganizationInvitationId,
  organizationId: OrganizationId,
  email: Email,
  accessLevel: OrganizationAccessLevel,
  status: OrganizationInvitationStatus,
  createdById: PersonId,
})

export type OrganizationInvitationRow = typeof OrganizationInvitationRow.Type
