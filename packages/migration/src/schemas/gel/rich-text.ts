import { Schema } from "effect"

/** Legacy input remains permissive; only migrated output uses the current node schemas. */
export class GelTiptapNode extends Schema.Opaque<GelTiptapNode>()(
  Schema.Struct({
    type: Schema.NonEmptyString,
    attrs: Schema.optional(Schema.Record(Schema.String, Schema.Unknown)),
    text: Schema.optional(Schema.String),
    marks: Schema.optional(
      Schema.Array(
        Schema.Struct({
          type: Schema.NonEmptyString,
          attrs: Schema.optional(Schema.Record(Schema.String, Schema.Json)),
        }),
      ),
    ),
    content: Schema.optional(
      Schema.Array(Schema.suspend((): Schema.Codec<GelTiptapNode> => GelTiptapNode)),
    ),
  }),
) {}

export const GelTiptapDocument = Schema.Struct({
  type: Schema.Literal("doc"),
  version: Schema.Literal(1),
  content: Schema.Array(GelTiptapNode),
})
export type GelTiptapDocument = typeof GelTiptapDocument.Type
