import { HttpApiBuilder } from "@effect/platform"
import { GororobasApi } from "@gororobas/domain"
import { Effect } from "effect"

export const ResourcesApiLive = HttpApiBuilder.group(GororobasApi, "resources", (handlers) =>
  handlers
    .handle("searchResources", () => Effect.succeed([]))
    .handle("getResourceByHandle", () => Effect.die("stub"))
    .handle("createResource", () => Effect.die("stub"))
    .handle("proposeResourceRevision", () => Effect.die("stub"))
    .handle("getResourceLink", () => Effect.die("stub"))
    .handle("toggleResourceBookmark", () => Effect.die("stub")),
)
