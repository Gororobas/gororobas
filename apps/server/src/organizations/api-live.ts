import { GororobasApi, OrganizationMembershipData } from "@gororobas/domain"
import { Effect, Array as EffectArray, Result } from "effect"
import { HttpApiBuilder } from "effect/http-api"

import { withApiInfrastructureErrors } from "../common/api-infrastructure-errors.js"
import { OrganizationsService } from "./service.js"

const endpoint = (name: string) =>
  withApiInfrastructureErrors({ group: "organizations", endpoint: name })

export const OrganizationsApiLive = HttpApiBuilder.group(
  GororobasApi,
  "organizations",
  (handlers) =>
    handlers
      .handle("createOrganization", ({ payload }) =>
        OrganizationsService.use((service) => service.createOrganization(payload)).pipe(
          endpoint("createOrganization"),
        ),
      )
      .handle("updateOrganization", ({ params, payload }) =>
        OrganizationsService.use((service) => service.updateOrganization(params.id, payload)).pipe(
          endpoint("updateOrganization"),
        ),
      )
      .handle("inviteMember", ({ params, payload }) =>
        OrganizationsService.use((service) =>
          service.inviteMember({ organizationId: params.id, ...payload }),
        ).pipe(endpoint("inviteMember")),
      )
      .handle("acceptInvitation", ({ params }) =>
        OrganizationsService.use((service) => service.acceptInvitation(params.id)).pipe(
          Effect.map((membership) => OrganizationMembershipData.make(membership)),
          endpoint("acceptInvitation"),
        ),
      )
      .handle("updateMemberRole", ({ params, payload }) =>
        OrganizationsService.use((service) =>
          service.updateMemberRole({
            organizationId: params.id,
            personId: params.personId,
            accessLevel: payload.accessLevel,
          }),
        ).pipe(
          Effect.as(
            OrganizationMembershipData.make({
              organizationId: params.id,
              personId: params.personId,
              accessLevel: payload.accessLevel,
            }),
          ),
          endpoint("updateMemberRole"),
        ),
      )
      .handle("removeMember", ({ params }) =>
        OrganizationsService.use((service) =>
          service.removeMember(params.id, params.personId),
        ).pipe(endpoint("removeMember")),
      )
      .handle("leaveOrganization", ({ params }) =>
        OrganizationsService.use((service) => service.leaveOrganization(params.id)).pipe(
          endpoint("leaveOrganization"),
        ),
      )
      .handle("deleteOrganization", ({ params }) =>
        OrganizationsService.use((service) => service.deleteOrganization(params.id)).pipe(
          endpoint("deleteOrganization"),
        ),
      )
      .handle("listMembers", ({ params }) =>
        OrganizationsService.use((service) => service.listMembers(params.id)).pipe(
          Effect.map((rows) =>
            EffectArray.filterMap(rows, (row) =>
              row.personId !== null && row.accessLevel !== null
                ? Result.succeed({
                    personId: row.personId,
                    organizationId: row.organizationId,
                    accessLevel: row.accessLevel,
                  })
                : Result.failVoid,
            ),
          ),
          endpoint("listMembers"),
        ),
      ),
)
