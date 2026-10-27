import { Context, Effect, Schema, SchemaTransformation } from 'effect'
export class DecodeCount extends Context.Service<
  DecodeCount,
  Readonly<{ parse: (value: string) => number }>
>()('PublicModelBoundary/DecodeCount') {}
export class EncodeCount extends Context.Service<
  EncodeCount,
  Readonly<{ format: (value: number) => string }>
>()('PublicModelBoundary/EncodeCount') {}
export const Count = Schema.String.pipe(
  Schema.decodeTo(
    Schema.Number,
    SchemaTransformation.transformEffect({
      decode: value => Effect.map(DecodeCount, service => service.parse(value)),
      encode: value =>
        Effect.map(EncodeCount, service => service.format(value)),
    }),
  ),
  Schema.brand('PublicModelCount'),
)
export const Model = Schema.Struct({ count: Count })
