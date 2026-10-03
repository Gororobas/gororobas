import StarterKit from "@tiptap/starter-kit"

import { EntityReference } from "./entity-reference-extension.js"
import { MediaGrid } from "./media-grid-extension.js"

export const tiptapExtensions = [
  StarterKit.configure({
    underline: false,
    codeBlock: false,
    heading: { levels: [1, 2, 3] },
  }),
  EntityReference,
  MediaGrid,
]
