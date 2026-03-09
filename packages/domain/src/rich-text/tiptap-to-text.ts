import type { TiptapDocument } from "@gororobas/domain"
import { generateText } from "@tiptap/core"
import StarterKit from "@tiptap/starter-kit"

import { Image } from "./image-extension.js"

const extensions = [StarterKit, Image]

export function tiptapToText(json: TiptapDocument): string {
  return generateText(
    // @ts-expect-error generateText doesn't accept readonly
    json,
    extensions,
  )
}
