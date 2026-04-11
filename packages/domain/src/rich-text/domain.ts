/**
 * Tiptap rich-text editor types.
 */
import { Schema } from "effect"

const UnknownTiptapAttrs = Schema.UndefinedOr(Schema.Record(Schema.NonEmptyString, Schema.Any))

const TiptapText = Schema.String

const TiptapMark = Schema.Struct({
  attrs: Schema.optional(UnknownTiptapAttrs),
  type: Schema.Trimmed.pipe(Schema.check(Schema.isNonEmpty())),
})

export const TiptapTextNode = Schema.Struct({
  marks: Schema.optional(Schema.Array(TiptapMark)),
  text: TiptapText,
  type: Schema.Literal("text"),
})
export type TiptapTextNode = typeof TiptapTextNode.Type

const tiptapNodeFields = {
  attrs: Schema.optional(UnknownTiptapAttrs),
  marks: Schema.optional(Schema.Array(TiptapMark)),
  text: Schema.optional(TiptapText),
  type: Schema.Trimmed.pipe(Schema.check(Schema.isNonEmpty())),
}

export class TiptapNode extends Schema.Opaque<TiptapNode>()(
  Schema.Struct({
    ...tiptapNodeFields,
    content: Schema.optional(
      Schema.Array(
        Schema.suspend(
          (): Schema.Codec<TiptapNode | TiptapTextNode> =>
            Schema.Union([TiptapNode, TiptapTextNode]),
        ),
      ),
    ),
  }),
) {}

export const TiptapDocument = Schema.Struct({
  content: Schema.Array(TiptapNode),
  type: Schema.Literal("doc"),
  version: Schema.Literal(1),
})
export type TiptapDocument = typeof TiptapDocument.Type

export const EMPTY_TIPTAP_DOCUMENT: TiptapDocument = TiptapDocument.make({
  content: [],
  type: "doc",
  version: 1,
})

export const RichTextColumn = Schema.fromJsonString(TiptapDocument)

export const TiptapAsHtml = Schema.String.pipe(Schema.brand("TiptapAsHtml"))
export type TiptapAsHtml = typeof TiptapAsHtml.Type
