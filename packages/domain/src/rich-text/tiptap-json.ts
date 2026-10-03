import type { JSONContent } from "@tiptap/core"

import type { TiptapDocument, TiptapNode } from "./domain.js"

/** Tiptap accepts mutable arrays; copy the domain arrays at that boundary. */
export const toTiptapJsonContent = (document: TiptapDocument): JSONContent => {
  const copy = (node: TiptapNode): JSONContent => ({
    type: node.type,
    ...("attrs" in node && node.attrs !== undefined ? { attrs: { ...node.attrs } } : {}),
    ...(node.type === "text" ? { text: node.text } : {}),
    ...(!("marks" in node) || node.marks === undefined
      ? {}
      : {
          marks: node.marks.map((mark) => ({
            type: mark.type,
            ...(mark.attrs === undefined ? {} : { attrs: { ...mark.attrs } }),
          })),
        }),
    ...("content" in node && node.content !== undefined ? { content: node.content.map(copy) } : {}),
  })
  return { type: "doc", content: document.content.map(copy) }
}
