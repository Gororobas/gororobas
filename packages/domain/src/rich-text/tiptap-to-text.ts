import { generateText } from "@tiptap/core"

import { TiptapDocument } from "./domain.js"
import { tiptapExtensions } from "./tiptap-extensions.js"
import { toTiptapJsonContent } from "./tiptap-json.js"

export function tiptapToText(document: TiptapDocument): string {
  return generateText(toTiptapJsonContent(document), tiptapExtensions)
}
