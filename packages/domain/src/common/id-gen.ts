/**
 * UUID generation service.
 */
import { type Brand, Context, Effect, Schema } from "effect"

type BrandedUUID<B extends string> = string & Brand.Brand<B>

interface IdGenerator {
  readonly generate: () => string
  readonly make: <B extends string>(
    brand: Schema.brand<Schema.Schema<string, string, never>, B>,
  ) => Effect.Effect<BrandedUUID<B>>
}

export class IdGen extends Context.Tag("IdGen")<IdGen, IdGenerator>() {
  static make<A extends Brand.Brand<any>>(
    schema: Schema.Schema<A, string>,
  ): Effect.Effect<A, never, IdGen> {
    return Effect.flatMap(IdGen, (gen) =>
      Effect.sync(() => Schema.decodeSync(schema)(gen.generate())),
    )
  }
}
