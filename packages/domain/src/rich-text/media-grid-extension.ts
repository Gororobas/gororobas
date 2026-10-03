import { Node } from "@tiptap/core"
import { Schema } from "effect"

import {
  MediaGridAttributes,
  type MediaGridItem,
  type TiptapDocument,
  type TiptapNode,
} from "./domain.js"

const AttributesJson = Schema.fromJsonString(MediaGridAttributes)

export const MediaGrid = Node.create({
  name: "mediaGrid",
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
      tag: "div[data-media-grid]",
      getAttrs: (element) =>
        Schema.decodeUnknownOption(AttributesJson)(element.getAttribute("data-media-grid")).pipe(
          (attributes) => (attributes._tag === "Some" ? attributes.value : false),
        ),
    },
  ],
  renderText: () => "",
  // The application node view hydrates media; HTML carries lossless references for translation and clipboard use.
  renderHTML: ({ node }) => [
    "div",
    {
      "data-media-grid": Schema.encodeSync(AttributesJson)(
        Schema.decodeUnknownSync(MediaGridAttributes)(node.attrs),
      ),
    },
  ],
})

export const mediaItemsFromTiptapDocument = (
  document: TiptapDocument,
): ReadonlyArray<MediaGridItem> => {
  const items: MediaGridItem[] = []
  const visit = (node: TiptapNode): void => {
    if (node.type === "mediaGrid") items.push(...node.attrs.items)
    if ("content" in node) node.content?.forEach(visit)
  }
  document.content.forEach(visit)
  return items
}
