import { GororobasApi } from "@gororobas/domain"
import { Effect } from "effect"
import { HttpApiBuilder } from "effect/unstable/httpapi"

export const PublicationsApiLive = HttpApiBuilder.group(GororobasApi, "publications", (handlers) =>
  handlers
    .handle("searchPublications", () => Effect.succeed([]))
    .handle("getPublication", () => Effect.die("stub"))
    .handle("getPublicationByHandle", () => Effect.die("stub"))
    .handle("createPost", () => Effect.die("stub"))
    .handle("createEvent", () => Effect.die("stub"))
    .handle("updatePost", () => Effect.die("stub"))
    .handle("deletePublication", () => Effect.die("stub"))
    .handle("getPublicationHistory", () => Effect.die("stub")),
)
