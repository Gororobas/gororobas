import { generateHTML, generateJSON } from "@tiptap/html"
import { Schema } from "effect"

import { TiptapDocument } from "./domain.js"
import { tiptapExtensions } from "./tiptap-extensions.js"
/** JSON ↔ HTML conversion for translation; custom node attributes retain their versioned data. */
import { toTiptapJsonContent } from "./tiptap-json.js"

export function tiptapToHtml(document: TiptapDocument): string {
  return generateHTML(toTiptapJsonContent(document), tiptapExtensions)
}

export function tiptapFromHtml(html: string): TiptapDocument {
  // oxlint-disable-next-line custom-lint-rules/no-schema-decode-unknown -- Tiptap HTML parsing returns an open dictionary without a document schema.
  return Schema.decodeUnknownSync(TiptapDocument)({
    ...generateJSON(html, tiptapExtensions),
    version: 1,
  })
}
