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
import { Handle } from "../common/primitives.js"

export const OrganizationRow = Schema.Struct({
  id: OrganizationId,
  membersVisibility: InformationVisibility,
  type: OrganizationType,
})
export type OrganizationRow = typeof OrganizationRow.Type

export const OrganizationMembership = Schema.Struct({
  accessLevel: OrganizationAccessLevel,
  createdAt: Schema.NullishOr(Schema.DateFromString),
  organizationId: OrganizationId,
  personId: PersonId,
  updatedAt: Schema.NullishOr(Schema.DateFromString),
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
  name: Schema.NonEmptyTrimmedString,
  type: OrganizationType,
})
export type CreateOrganizationData = typeof CreateOrganizationData.Type

export const UpdateOrganizationData = Schema.Struct({
  membersVisibility: Schema.optional(InformationVisibility),
  name: Schema.optional(Schema.NonEmptyTrimmedString),
})
export type UpdateOrganizationData = typeof UpdateOrganizationData.Type
