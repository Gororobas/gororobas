/**
 * Organization-related errors.
 */
import { Schema } from "effect"

import { OrganizationId } from "../common/ids.js"
import { Handle } from "../common/primitives.js"

export class OrganizationNotFoundError extends Schema.TaggedErrorClass<OrganizationNotFoundError>()(
  "OrganizationNotFoundError",
  {
    id: Schema.optional(OrganizationId),
    handle: Schema.optional(Handle),
  },
  { httpApiStatus: 404 },
) {}

export class LastManagerCannotLeaveError extends Schema.TaggedErrorClass<LastManagerCannotLeaveError>()(
  "LastManagerCannotLeaveError",
  {
    organization_id: OrganizationId,
  },
  { httpApiStatus: 403 },
) {}
