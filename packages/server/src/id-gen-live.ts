/**
 * Bun UUID generation implementation using UUIDv7.
 */
import { IdGen } from "@gororobas/domain"
import { Effect, Layer, Schema } from "effect"

export const IdGenLive = Layer.succeed(IdGen, {
  generate: () => Bun.randomUUIDv7(),
  make: (brand) => Effect.sync(() => Schema.decodeSync(brand)(Bun.randomUUIDv7())),
})
