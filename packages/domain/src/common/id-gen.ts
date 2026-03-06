/**
 * UUID generation service.
 */
import { Schema, ServiceMap } from "effect"

interface IdGenerator {
  readonly generate: () => string
}

export class IdGen extends ServiceMap.Service<IdGen, IdGenerator>()("IdGen") {
  static make<A extends Schema.brand<Schema.String, any>>(schema: A) {
    return IdGen.use((gen) => Schema.decodeEffect(schema)(gen.generate()))
  }
}
