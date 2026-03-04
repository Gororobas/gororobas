import { GororobasApi } from "@gororobas/domain"
import { Effect } from "effect"
import { HttpApiBuilder } from "effect/unstable/httpapi"

export const ResourcesApiLive = HttpApiBuilder.group(GororobasApi, "resources", (handlers) =>
  handlers
    .handle("searchResources", () => Effect.succeed([]))
    .handle("getResourceByHandle", () => Effect.die("stub"))
    .handle("createResource", () => Effect.die("stub"))
    .handle("proposeResourceRevision", () => Effect.die("stub"))
    .handle("getResourceLink", () => Effect.die("stub"))
    .handle("toggleResourceBookmark", () => Effect.die("stub")),
)
