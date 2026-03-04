/**
 * Tiptap JSON ↔ HTML conversion utilities.
 *
 * Used by the translation workflow to serialize TiptapDocument to HTML
 * (which LLMs handle well) and parse the translated HTML back.
 */
import type { TiptapDocument } from "@gororobas/domain"
import { generateHTML, generateJSON } from "@tiptap/html"
import StarterKit from "@tiptap/starter-kit"

import { Image } from "./image-extension.js"

const extensions = [StarterKit, Image]

export function tiptapToHtml(json: TiptapDocument): string {
  return generateHTML(
    // @ts-expect-error generateHTML doesn't accept readonly
    json,
    extensions,
  )
}

export function tiptapFromHtml(html: string): TiptapDocument {
  return generateJSON(html, extensions) as TiptapDocument
}
