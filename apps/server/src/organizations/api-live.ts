import { GororobasApi } from "@gororobas/domain"
import { Effect, Array as EffectArray, Result } from "effect"
import { HttpApiBuilder } from "effect/http-api"

import { withApiInfrastructureErrors } from "../common/api-infrastructure-errors.js"
import { OrganizationsService } from "./service.js"

export const OrganizationsApiLive = HttpApiBuilder.group(
  GororobasApi,
  "organizations",
  (handlers) =>
    handlers
      .handle("createOrganization", () => Effect.die("stub"))
      .handle("updateOrganization", () => Effect.die("stub"))
      .handle("inviteMember", () => Effect.die("stub"))
      .handle("updateMemberRole", () => Effect.die("stub"))
      .handle("removeMember", () => Effect.die("stub"))
      .handle("leaveOrganization", () => Effect.die("stub"))
      .handle("deleteOrganization", () => Effect.die("stub"))
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
          withApiInfrastructureErrors({ group: "organizations", endpoint: "listMembers" }),
        ),
      ),
)
