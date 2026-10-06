import { Node } from "@tiptap/core"
import { MutableHashSet, Option, Schema } from "effect"

import {
  EntityReferenceAttributes,
  EntityReferenceTarget,
  type TiptapDocument,
  type TiptapNode,
} from "./domain.js"

const AttributesJson = Schema.fromJsonString(EntityReferenceAttributes)

export const EntityReference = Node.create({
  name: "entityReference",
  group: "inline",
  inline: true,
  selectable: false,
  atom: true,
  marks: "",
  addAttributes: () => ({
    version: { default: 1, rendered: false },
    referenceId: { default: null, rendered: false },
    referenceType: { default: null, rendered: false },
    labelAtInsertion: { default: null, rendered: false },
  }),
  parseHTML: () => [
    {
      tag: "span[data-entity-reference]",
      getAttrs: (element) =>
        // oxlint-disable-next-line custom-lint-rules/no-schema-decode-unknown -- DOM attributes may be absent or contain malformed JSON.
        Schema.decodeUnknownOption(AttributesJson)(
          element.getAttribute("data-entity-reference"),
        ).pipe((attributes) => (Option.isSome(attributes) ? attributes.value : false)),
    },
  ],
  renderText: ({ node }) =>
    // oxlint-disable-next-line custom-lint-rules/no-schema-decode-unknown -- ProseMirror attributes are an unvalidated dictionary.
    Schema.decodeUnknownSync(EntityReferenceAttributes)(node.attrs).labelAtInsertion,
  renderHTML: ({ node }) => {
    // oxlint-disable-next-line custom-lint-rules/no-schema-decode-unknown -- ProseMirror attributes are an unvalidated dictionary.
    const attributes = Schema.decodeUnknownSync(EntityReferenceAttributes)(node.attrs)

    return [
      "span",
      { "data-entity-reference": Schema.encodeSync(AttributesJson)(attributes) },
      attributes.labelAtInsertion,
    ]
  },
})

export const linkedEntitiesFromTiptapDocument = (
  document: TiptapDocument,
): ReadonlyArray<EntityReferenceTarget> => {
  const entities: EntityReferenceTarget[] = []
  const seen = MutableHashSet.empty<string>()

  const visit = (node: TiptapNode): void => {
    if (node.type === "entityReference") {
      const { referenceId, referenceType } = node.attrs
      const key = `${referenceType}:${referenceId}`

      if (!MutableHashSet.has(seen, key)) {
        MutableHashSet.add(seen, key)
        // oxlint-disable-next-line custom-lint-rules/no-schema-decode-unknown -- ProseMirror attributes are an unvalidated dictionary.
        entities.push(Schema.decodeUnknownSync(EntityReferenceTarget)(node.attrs))
      }
    }

    if ("content" in node) node.content?.forEach(visit)
  }

  document.content.forEach(visit)
  return entities
}
