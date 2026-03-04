import { GororobasApi } from "@gororobas/domain"
import { Effect } from "effect"
import { HttpApiBuilder } from "effect/unstable/httpapi"

export const PostsApiLive = HttpApiBuilder.group(GororobasApi, "posts", (handlers) =>
  handlers
    .handle("searchPosts", () => Effect.succeed([]))
    .handle("getPost", () => Effect.die("stub"))
    .handle("getPostByHandle", () => Effect.die("stub"))
    .handle("createNote", () => Effect.die("stub"))
    .handle("createEvent", () => Effect.die("stub"))
    .handle("updateNote", () => Effect.die("stub"))
    .handle("deletePost", () => Effect.die("stub"))
    .handle("getPostHistory", () => Effect.die("stub")),
)
