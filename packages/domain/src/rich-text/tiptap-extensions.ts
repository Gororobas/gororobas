import StarterKit from "@tiptap/starter-kit"

import { EntityReference } from "./entity-reference-extension.js"
import { MediaGallery } from "./media-gallery-extension.js"
import { NodeIdExtension } from "./node-id-extension.js"

export const tiptapExtensions = [
  StarterKit.configure({
    underline: false,
    codeBlock: false,
    heading: { levels: [1, 2, 3] },
  }),
  EntityReference,
  MediaGallery,
  NodeIdExtension,
]
