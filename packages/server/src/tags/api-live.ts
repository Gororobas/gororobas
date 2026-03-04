import { GororobasApi } from "@gororobas/domain"
import { Effect } from "effect"
import { HttpApiBuilder } from "effect/unstable/httpapi"

export const TagsApiLive = HttpApiBuilder.group(GororobasApi, "tags", (handlers) =>
  handlers
    .handle("getAllTags", () => Effect.succeed([]))
    .handle("createTag", () => Effect.die("stub"))
    .handle("editTag", () => Effect.die("stub")),
)
