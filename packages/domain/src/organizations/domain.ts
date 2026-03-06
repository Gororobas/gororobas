/**
 * Organization domain entity and related types.
 */
import { Schema } from "effect"

import {
  InformationVisibility,
  OrganizationAccessLevel,
  OrganizationType,
} from "../common/enums.js"
import { OrganizationId, PersonId } from "../common/ids.js"
import { Handle, TimestampColumn } from "../common/primitives.js"

export const OrganizationRow = Schema.Struct({
  id: OrganizationId,
  membersVisibility: InformationVisibility,
  type: OrganizationType,
})
export type OrganizationRow = typeof OrganizationRow.Type

export const OrganizationMembership = Schema.Struct({
  accessLevel: OrganizationAccessLevel,
  createdAt: Schema.NullishOr(TimestampColumn),
  organizationId: OrganizationId,
  personId: PersonId,
  updatedAt: Schema.NullishOr(TimestampColumn),
})
export type OrganizationMembership = typeof OrganizationMembership.Type

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
