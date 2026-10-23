import { Schema } from "effect"
/**
 * Organizations HTTP API endpoints.
 */
import { HttpApiEndpoint, HttpApiGroup } from "effect/http-api"

import { UnauthorizedError } from "../authorization/session.js"
import { OrganizationAccessLevel } from "../common/enums.js"
import { HandleTakenError } from "../common/errors.js"
import { OrganizationId, PersonId } from "../common/ids.js"
import { Handle } from "../common/primitives.js"
import { PersonNotFoundError } from "../people/errors.js"
import {
  CreateOrganizationData,
  OrganizationInvitationRow,
  OrganizationMembershipData,
  UpdateOrganizationData,
} from "./domain.js"
import {
  LastManagerCannotLeaveError,
  OrganizationInvitationExpiredError,
  OrganizationInvitationNotFoundError,
  OrganizationMembershipNotFoundError,
  OrganizationNotFoundError,
} from "./errors.js"

const OrganizationParams = Schema.Struct({ id: OrganizationId })
const MemberParams = Schema.Struct({ id: OrganizationId, personId: PersonId })

export class OrganizationsApiGroup extends HttpApiGroup.make("organizations")
  .add(
    HttpApiEndpoint.post("createOrganization", "/organizations", {
      success: Schema.Struct({ id: OrganizationId, handle: Handle }),
      error: [HandleTakenError, UnauthorizedError],
      payload: CreateOrganizationData,
    }),
  )
  .add(
    HttpApiEndpoint.patch("updateOrganization", "/organizations/:id", {
      success: Schema.Literal(true),
      error: [OrganizationNotFoundError, UnauthorizedError],
      params: OrganizationParams,
      payload: UpdateOrganizationData,
    }),
  )
  .add(
    /** Invites a person with community access; they become a member once they accept. */
    HttpApiEndpoint.post("inviteMember", "/organizations/:id/invitations", {
      success: OrganizationInvitationRow,
      error: [OrganizationNotFoundError, PersonNotFoundError, UnauthorizedError],
      params: OrganizationParams,
      payload: Schema.Struct({ personId: PersonId, accessLevel: OrganizationAccessLevel }),
    }),
  )
  .add(
    /** Accepts the signed-in person's pending invitation to the organization. */
    HttpApiEndpoint.post("acceptInvitation", "/organizations/:id/invitations/accept", {
      success: OrganizationMembershipData,
      error: [
        OrganizationNotFoundError,
        OrganizationInvitationNotFoundError,
        OrganizationInvitationExpiredError,
        PersonNotFoundError,
        UnauthorizedError,
      ],
      params: OrganizationParams,
    }),
  )
  .add(
    HttpApiEndpoint.patch("updateMemberRole", "/organizations/:id/members/:personId", {
      success: OrganizationMembershipData,
      error: [
        OrganizationNotFoundError,
        OrganizationMembershipNotFoundError,
        LastManagerCannotLeaveError,
        UnauthorizedError,
      ],
      params: MemberParams,
      payload: Schema.Struct({ accessLevel: OrganizationAccessLevel }),
    }),
  )
  .add(
    HttpApiEndpoint.delete("removeMember", "/organizations/:id/members/:personId", {
      success: Schema.Void,
      error: [
        OrganizationNotFoundError,
        OrganizationMembershipNotFoundError,
        LastManagerCannotLeaveError,
        UnauthorizedError,
      ],
      params: MemberParams,
    }),
  )
  .add(
    HttpApiEndpoint.post("leaveOrganization", "/organizations/:id/leave", {
      success: Schema.Void,
      error: [
        OrganizationNotFoundError,
        OrganizationMembershipNotFoundError,
        LastManagerCannotLeaveError,
        UnauthorizedError,
      ],
      params: OrganizationParams,
    }),
  )
  .add(
    HttpApiEndpoint.delete("deleteOrganization", "/organizations/:id", {
      success: Schema.Void,
      error: [OrganizationNotFoundError, UnauthorizedError],
      params: OrganizationParams,
    }),
  )
  .add(
    HttpApiEndpoint.get("listMembers", "/organizations/:id/members", {
      success: Schema.Array(OrganizationMembershipData),
      error: [OrganizationNotFoundError, UnauthorizedError],
      params: OrganizationParams,
    }),
  ) {}
