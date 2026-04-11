/**
 * UUID generation service.
 */
import { Context, Schema } from "effect"

interface IdGenerator {
  readonly generate: () => string
}

export class IdGen extends Context.Service<IdGen, IdGenerator>()("IdGen") {
  static make<A extends Schema.Top>(schema: A) {
    return IdGen.use((gen) => Schema.decodeEffect(schema)(gen.generate()))
  }
}
