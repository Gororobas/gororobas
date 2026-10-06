import type { JSONContent } from "@tiptap/core"

import type { TiptapDocument, TiptapNode } from "./domain.js"

/** Tiptap accepts mutable arrays; copy the domain arrays at that boundary. */
export const toTiptapJsonContent = (document: TiptapDocument): JSONContent => {
  const copy = (node: TiptapNode): JSONContent => {
    const content: JSONContent = { type: node.type }
    if ("attrs" in node && node.attrs !== undefined) content.attrs = { ...node.attrs }
    if (node.type === "text") content.text = node.text

    if ("marks" in node && node.marks !== undefined) {
      content.marks = node.marks.map((mark) => {
        const copiedMark: NonNullable<JSONContent["marks"]>[number] = { type: mark.type }
        if (mark.attrs !== undefined) copiedMark.attrs = { ...mark.attrs }
        return copiedMark
      })
    }

    if ("content" in node && node.content !== undefined) content.content = node.content.map(copy)
    return content
  }

  return { type: "doc", content: document.content.map(copy) }
}
