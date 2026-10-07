/**
 * Organization-related errors.
 */
import { Schema } from "effect"

import { OrganizationId, PersonId } from "../common/ids.js"
import { Handle } from "../common/primitives.js"

export class OrganizationNotFoundError extends Schema.TaggedError<OrganizationNotFoundError>()(
  "OrganizationNotFoundError",
  {
    id: Schema.optional(OrganizationId),
    handle: Schema.optional(Handle),
  },
  { httpApiStatus: 404 },
) {}

export class LastManagerCannotLeaveError extends Schema.TaggedError<LastManagerCannotLeaveError>()(
  "LastManagerCannotLeaveError",
  {
    organizationId: OrganizationId,
  },
  { httpApiStatus: 403 },
) {}

export class OrganizationInvitationNotFoundError extends Schema.TaggedError<OrganizationInvitationNotFoundError>()(
  "OrganizationInvitationNotFoundError",
  { organizationId: OrganizationId },
  { httpApiStatus: 404 },
) {}

export class OrganizationMembershipNotFoundError extends Schema.TaggedError<OrganizationMembershipNotFoundError>()(
  "OrganizationMembershipNotFoundError",
  { organizationId: OrganizationId, personId: PersonId },
  { httpApiStatus: 404 },
) {}

export class OrganizationInvitationExpiredError extends Schema.TaggedError<OrganizationInvitationExpiredError>()(
  "OrganizationInvitationExpiredError",
  { organizationId: OrganizationId },
  { httpApiStatus: 410 },
) {}
