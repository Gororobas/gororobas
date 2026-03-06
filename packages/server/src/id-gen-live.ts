/**
 * Bun UUID generation implementation using UUIDv7.
 */
import { IdGen } from "@gororobas/domain"
import { Layer } from "effect"

export const IdGenLive = Layer.succeed(IdGen, {
  generate: () => Bun.randomUUIDv7(),
})
