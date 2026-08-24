import { IdGen } from "@gororobas/domain"
import { Layer } from "effect"
import { v7 } from "uuid"

export const IdGenLive = Layer.succeed(IdGen, {
  generate: () => v7(),
})
