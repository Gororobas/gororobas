import { HttpApiBuilder } from "@effect/platform"
import { GororobasApi } from "@gororobas/domain"
import { Effect } from "effect"

export const CommentsApiLive = HttpApiBuilder.group(GororobasApi, "comments", (handlers) =>
  handlers
    .handle("getComments", () => Effect.succeed([]))
    .handle("getComment", () => Effect.die("stub"))
    .handle("createPostComment", () => Effect.die("stub"))
    .handle("createResourceComment", () => Effect.die("stub"))
    .handle("createReplyComment", () => Effect.die("stub"))
    .handle("updateComment", () => Effect.die("stub"))
    .handle("deleteComment", () => Effect.die("stub"))
    .handle("censorComment", () => Effect.die("stub")),
)
