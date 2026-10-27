import { generateHTML, generateJSON } from "@tiptap/html"
import { Schema } from "effect"

import { TiptapDocument } from "./domain.js"
import { assignTiptapNodeIds } from "./node-ids.js"
import { tiptapExtensions } from "./tiptap-extensions.js"
/** JSON ↔ HTML conversion for translation; custom node attributes retain their versioned data. */
import { toTiptapJsonContent } from "./tiptap-json.js"

export function tiptapToHtml(document: TiptapDocument): string {
  return generateHTML(toTiptapJsonContent(document), tiptapExtensions)
}

export function tiptapFromHtml(
  html: string,
  options: {
    /**
     * Nodes that lost their `data-node-id` (a machine translation may drop attributes) take the ID of
     * the node at the same position in `referenceContent`, then fresh ones.
     */
    readonly referenceContent?: TiptapDocument | undefined
  } = {},
): TiptapDocument {
  // oxlint-disable-next-line custom-lint-rules/no-schema-decode-unknown -- Tiptap HTML parsing returns an open dictionary without a document schema.
  const document = Schema.decodeUnknownSync(TiptapDocument)({
    ...generateJSON(html, tiptapExtensions),
    version: 1,
  })
  return assignTiptapNodeIds(document, options)
}
