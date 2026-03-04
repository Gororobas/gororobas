import { HttpApiBuilder } from "@effect/platform"
import { GororobasApi } from "@gororobas/domain"
import { Effect } from "effect"

export const VegetablesApiLive = HttpApiBuilder.group(GororobasApi, "vegetables", (handlers) =>
  handlers
    .handle("searchVegetables", () => Effect.die("stub"))
    .handle("getVegetableByHandle", () => Effect.die("stub"))
    .handle("createVegetable", () => Effect.die("stub"))
    .handle("createVegetableRevision", () => Effect.die("stub"))
    .handle("evaluateVegetableRevision", () => Effect.die("stub"))
    .handle("toggleVegetableBookmark", () => Effect.die("stub")),
)
