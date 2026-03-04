/**
 * Custom Tiptap image extension that uses a `data-image-data` attribute
 * to store structured image metadata (Sanity asset references, attribution, etc.).
 *
 * This mirrors the client-side editor's image extension so that
 * HTML ↔ JSON round-trips preserve image nodes correctly during translation.
 */
import { Node, nodeInputRule } from "@tiptap/core"

const inputRegex = /(?:^|\s)(!\[(.+|:?)]\((\S+)(?:(?:\s+)["'](\S+)["'])?\))$/

export const Image = Node.create({
  name: "image",
  group: "block",
  atom: true,
  inline: false,
  selectable: true,

  addAttributes() {
    return {
      data: {
        default: null,
        parseHTML: (element) => element.getAttribute("data-image-data"),
        renderHTML: (attributes) => {
          if (!attributes.data) {
            return {}
          }
          return {
            "data-image-data": attributes.data,
          }
        },
      },
    }
  },

  addInputRules() {
    return [
      nodeInputRule({
        find: inputRegex,
        type: this.type,
        getAttributes: (match) => {
          const [, , alt, src, title] = match
          return { src, alt, title }
        },
      }),
    ]
  },

  parseHTML() {
    return [
      {
        tag: "block-image",
        getAttrs: (node) => ({ data: node.getAttribute("data-image-data") }),
      },
    ]
  },

  renderHTML({ node }) {
    return ["block-image", { "data-image-data": node.attrs.data }]
  },
})
