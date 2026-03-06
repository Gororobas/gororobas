import { Schema } from "effect"
/**
 * Organizations HTTP API endpoints.
 */
import { HttpApiEndpoint, HttpApiGroup } from "effect/unstable/httpapi"

import { OrganizationAccessLevel } from "../common/enums.js"
import { HandleTakenError } from "../common/errors.js"
import { OrganizationId, PersonId } from "../common/ids.js"
import { Handle } from "../common/primitives.js"
import { PersonNotFoundError } from "../people/errors.js"
import {
  CreateOrganizationData,
  OrganizationMembershipData,
  UpdateOrganizationData,
} from "./domain.js"
import { LastManagerCannotLeaveError, OrganizationNotFoundError } from "./errors.js"

export class OrganizationsApiGroup extends HttpApiGroup.make("organizations")
  .add(
    HttpApiEndpoint.post("createOrganization", "/organizations", {
      success: Schema.Struct({ id: OrganizationId, handle: Handle }),
      error: HandleTakenError,
      payload: CreateOrganizationData,
    }),
  )
  .add(
    HttpApiEndpoint.patch("updateOrganization", "/organizations/:id", {
      success: Schema.Literal(true),
      error: OrganizationNotFoundError,
      params: Schema.Struct({ id: OrganizationId }),
      payload: UpdateOrganizationData,
    }),
  )
  .add(
    HttpApiEndpoint.post("inviteMember", "/organizations/:id/members", {
      success: OrganizationMembershipData,
      error: [OrganizationNotFoundError, PersonNotFoundError],
      params: Schema.Struct({ id: OrganizationId }),
      payload: Schema.Struct({ person_id: PersonId, access_level: OrganizationAccessLevel }),
    }),
  )
  .add(
    HttpApiEndpoint.patch("updateMemberRole", "/organizations/:id/members/:person_id", {
      success: OrganizationMembershipData,
      error: [OrganizationNotFoundError, PersonNotFoundError],
      params: Schema.Struct({ id: OrganizationId, person_id: PersonId }),
      payload: Schema.Struct({ access_level: OrganizationAccessLevel }),
    }),
  )
  .add(
    HttpApiEndpoint.delete("removeMember", "/organizations/:id/members/:person_id", {
      success: Schema.Void,
      error: [OrganizationNotFoundError, LastManagerCannotLeaveError],
      params: Schema.Struct({ id: OrganizationId, person_id: PersonId }),
    }),
  )
  .add(
    HttpApiEndpoint.delete("leaveOrganization", "/organizations/:id/members/me", {
      success: Schema.Void,
      error: [OrganizationNotFoundError, LastManagerCannotLeaveError],
      params: Schema.Struct({ id: OrganizationId }),
    }),
  )
  .add(
    HttpApiEndpoint.delete("deleteOrganization", "/organizations/:id", {
      success: Schema.Void,
      error: OrganizationNotFoundError,
      params: Schema.Struct({ id: OrganizationId }),
    }),
  )
  .add(
    HttpApiEndpoint.get("listMembers", "/organizations/:id/members", {
      success: Schema.Array(OrganizationMembershipData),
      error: OrganizationNotFoundError,
      params: Schema.Struct({ id: OrganizationId }),
    }),
  ) {}
