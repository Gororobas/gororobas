/**
 * Organization-related errors.
 */
import { Schema } from "effect"

import { OrganizationId } from "../common/ids.js"
import { Handle } from "../common/primitives.js"

export class OrganizationNotFoundError extends Schema.TaggedError<OrganizationNotFoundError>()(
  "OrganizationNotFoundError",
  {
    id: Schema.optional(OrganizationId),
    handle: Schema.optional(Handle),
  },
) {}

export class LastManagerCannotLeaveError extends Schema.TaggedError<LastManagerCannotLeaveError>()(
  "LastManagerCannotLeaveError",
  {
    organization_id: OrganizationId,
  },
) {}
