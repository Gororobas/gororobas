import { GororobasApi } from "@gororobas/domain"
import { Effect } from "effect"
import { HttpApiBuilder } from "effect/unstable/httpapi"

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
      .handle("listMembers", () => Effect.die("stub")),
)
