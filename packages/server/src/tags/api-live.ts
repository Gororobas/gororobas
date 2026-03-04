import { HttpApiBuilder } from "@effect/platform"
import { GororobasApi } from "@gororobas/domain"
import { Effect } from "effect"

export const TagsApiLive = HttpApiBuilder.group(GororobasApi, "tags", (handlers) =>
  handlers
    .handle("getAllTags", () => Effect.succeed([]))
    .handle("createTag", () => Effect.die("stub"))
    .handle("editTag", () => Effect.die("stub")),
)
