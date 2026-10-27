import { mergeAttributes, Node } from "@tiptap/core"
import { Option, Schema } from "effect"

import {
  MediaGalleryAttributes,
  type MediaGalleryItem,
  type TiptapDocument,
  type TiptapNode,
} from "./domain.js"

const AttributesJson = Schema.fromJsonString(MediaGalleryAttributes)

export const MediaGallery = Node.create({
  name: "mediaGallery",
  group: "block",
  inline: false,
  selectable: true,
  atom: true,
  marks: "",
  addAttributes: () => ({
    version: { default: 1, rendered: false },
    items: { default: null, rendered: false },
  }),
  parseHTML: () => [
    {
      tag: "div[data-media-gallery]",
      getAttrs: (element) =>
        // oxlint-disable-next-line custom-lint-rules/no-schema-decode-unknown -- DOM attributes may be absent or contain malformed JSON.
        Schema.decodeUnknownOption(AttributesJson)(element.getAttribute("data-media-gallery")).pipe(
          (attributes) => (Option.isSome(attributes) ? attributes.value : false),
        ),
    },
  ],
  renderText: () => "",
  // The application node view hydrates media; HTML carries lossless references for translation and clipboard use.
  renderHTML: ({ node, HTMLAttributes }) => {
    // oxlint-disable-next-line custom-lint-rules/no-schema-decode-unknown -- ProseMirror attributes are an unvalidated dictionary.
    const { ...attributes } = Schema.decodeUnknownSync(MediaGalleryAttributes)(node.attrs)

    return [
      "div",
      mergeAttributes(HTMLAttributes, {
        "data-media-gallery": Schema.encodeSync(AttributesJson)(attributes),
      }),
    ]
  },
})

export const mediaItemsFromTiptapDocument = (
  document: TiptapDocument,
): ReadonlyArray<MediaGalleryItem> => {
  const items: MediaGalleryItem[] = []
  const visit = (node: TiptapNode): void => {
    if (node.type === "mediaGallery") items.push(...node.attrs.items)
    if ("content" in node) node.content?.forEach(visit)
  }
  document.content.forEach(visit)
  return items
}
