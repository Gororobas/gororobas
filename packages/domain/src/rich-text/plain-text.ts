import { Array as EffectArray, Option, String as EffectString, pipe } from "effect"

import type { TiptapDocument } from "./domain.js"
import { assignTiptapNodeIds } from "./node-ids.js"

/** A blank line between paragraphs, like `tiptapToText` writes them. */
const PARAGRAPH_SEPARATOR = /\n[^\S\n]*\n\s*/

/**
 * Text typed in a plain text field as a document: blank lines separate paragraphs, and single line
 * breaks stay inside them. `None` when there's nothing but whitespace.
 *
 * Paragraphs keep the node IDs of `referenceContent`'s, such as the document the text was edited
 * from, so links to them survive the edit.
 */
export const plainTextToTiptapDocument = (
  text: string,
  options: { readonly referenceContent?: TiptapDocument | undefined } = {},
): Option.Option<TiptapDocument> => {
  const paragraphs = pipe(
    text.replace(/\r\n?/g, "\n").split(PARAGRAPH_SEPARATOR),
    EffectArray.map(EffectString.trim),
    EffectArray.filter(EffectString.isNonEmpty),
  )

  if (!EffectArray.isReadonlyArrayNonEmpty(paragraphs)) return Option.none()

  return Option.some(
    assignTiptapNodeIds(
      {
        type: "doc",
        version: 1,
        content: paragraphs.map((paragraph) => ({
          type: "paragraph" as const,
          content: EffectArray.intersperse(
            paragraph.split("\n").map((line) => ({ type: "text" as const, text: line })),
            { type: "hardBreak" as const },
          ).filter((node) => node.type === "hardBreak" || node.text !== ""),
        })),
      },
      options,
    ),
  )
}
