/**
 * Organizations HTTP API endpoints.
 */
import { HttpApiEndpoint, HttpApiGroup } from "@effect/platform"
import { Schema } from "effect"

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
    HttpApiEndpoint.post("createOrganization", "/organizations")
      .addSuccess(Schema.Struct({ id: OrganizationId, handle: Handle }))
      .addError(HandleTakenError, { status: 409 })
      .setPayload(CreateOrganizationData),
  )
  .add(
    HttpApiEndpoint.patch("updateOrganization", "/organizations/:id")
      .addSuccess(Schema.Literal(true))
      .addError(OrganizationNotFoundError, { status: 404 })
      .setPath(Schema.Struct({ id: OrganizationId }))
      .setPayload(UpdateOrganizationData),
  )
  .add(
    HttpApiEndpoint.post("inviteMember", "/organizations/:id/members")
      .addSuccess(OrganizationMembershipData)
      .addError(OrganizationNotFoundError, { status: 404 })
      .addError(PersonNotFoundError, { status: 404 })
      .setPath(Schema.Struct({ id: OrganizationId }))
      .setPayload(Schema.Struct({ person_id: PersonId, access_level: OrganizationAccessLevel })),
  )
  .add(
    HttpApiEndpoint.patch("updateMemberRole", "/organizations/:id/members/:person_id")
      .addSuccess(OrganizationMembershipData)
      .addError(OrganizationNotFoundError, { status: 404 })
      .addError(PersonNotFoundError, { status: 404 })
      .setPath(Schema.Struct({ id: OrganizationId, person_id: PersonId }))
      .setPayload(Schema.Struct({ access_level: OrganizationAccessLevel })),
  )
  .add(
    HttpApiEndpoint.del("removeMember", "/organizations/:id/members/:person_id")
      .addSuccess(Schema.Void)
      .addError(OrganizationNotFoundError, { status: 404 })
      .addError(LastManagerCannotLeaveError, { status: 400 })
      .setPath(Schema.Struct({ id: OrganizationId, person_id: PersonId })),
  )
  .add(
    HttpApiEndpoint.del("leaveOrganization", "/organizations/:id/members/me")
      .addSuccess(Schema.Void)
      .addError(OrganizationNotFoundError, { status: 404 })
      .addError(LastManagerCannotLeaveError, { status: 400 })
      .setPath(Schema.Struct({ id: OrganizationId })),
  )
  .add(
    HttpApiEndpoint.del("deleteOrganization", "/organizations/:id")
      .addSuccess(Schema.Void)
      .addError(OrganizationNotFoundError, { status: 404 })
      .setPath(Schema.Struct({ id: OrganizationId })),
  )
  .add(
    HttpApiEndpoint.get("listMembers", "/organizations/:id/members")
      .addSuccess(Schema.Array(OrganizationMembershipData))
      .addError(OrganizationNotFoundError, { status: 404 })
      .setPath(Schema.Struct({ id: OrganizationId })),
  ) { }
