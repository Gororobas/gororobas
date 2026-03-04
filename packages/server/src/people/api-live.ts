import { GororobasApi } from "@gororobas/domain"
import { Effect } from "effect"
import { HttpApiBuilder } from "effect/unstable/httpapi"

export const PeopleApiLive = HttpApiBuilder.group(GororobasApi, "people", (handlers) =>
  handlers
    .handle("deletePerson", () => Effect.die("stub"))
    .handle("setAccessLevel", () => Effect.die("stub"))
    .handle("updateProfile", () => Effect.die("stub")),
)
