import { HttpApiBuilder } from "@effect/platform"
import { GororobasApi } from "@gororobas/domain"
import { Effect } from "effect"

export const MediaApiLive = HttpApiBuilder.group(GororobasApi, "media", (handlers) =>
  handlers
    .handle("uploadMedia", () => Effect.die("stub"))
    .handle("getMedia", () => Effect.die("stub"))
    .handle("censorMedia", () => Effect.die("stub")),
)
