import { Array as EffectArray, Option, Record, Schema } from "effect"
import { LoroList, LoroMap, LoroText, type Delta } from "loro-crdt"

import { InvalidCrdtUpdateError } from "../crdts/errors.js"
import { toLoroString, toLoroValue } from "../crdts/loro-values.js"
import { TiptapDocument, type TiptapNode, type TiptapTextNode } from "./domain.js"

const JsonAttributes = Schema.Record(Schema.String, Schema.Json)
type RichTextNode = TiptapNode | TiptapTextNode | TiptapDocument

/**
 * Matches loro-prosemirror's nodeName/attributes/children format. Consecutive
 * ProseMirror text nodes share one LoroText, with marks represented as deltas.
 * https://github.com/loro-dev/loro-prosemirror/blob/main/src/lib.ts
 */
export const initializeLoroRichText = (container: LoroMap, document: TiptapDocument) => {
  const writeNode = (map: LoroMap, node: RichTextNode): void => {
    map.set("nodeName", toLoroString(node.type))

    if ("attrs" in node && node.attrs !== undefined) {
      const attributes = map.setContainer("attributes", new LoroMap())
      Record.toEntries(Schema.decodeUnknownSync(JsonAttributes)(node.attrs)).forEach(
        ([key, value]) => attributes.set(toLoroString(key), toLoroValue(value)),
      )
    }

    if (!("content" in node) || node.content === undefined) return
    const children = map.setContainer("children", new LoroList())
    let text = Option.none<LoroText>()

    node.content.forEach((child) => {
      if (child.type === "text" && child.text !== undefined) {
        const currentText = Option.getOrElse(text, () =>
          children.insertContainer(children.length, new LoroText()),
        )
        text = Option.some(currentText)

        const attributes = Record.fromEntries(
          ("marks" in child ? (child.marks ?? []) : []).map((mark) => [
            toLoroString(mark.type),
            toLoroValue(Schema.decodeUnknownSync(JsonAttributes)(mark.attrs ?? {})),
          ]),
        )

        const delta: Delta<string> = { insert: toLoroString(child.text), attributes }
        currentText.applyDelta([{ retain: currentText.length }, delta])
      } else {
        text = Option.none()
        writeNode(children.insertContainer(children.length, new LoroMap()), child)
      }
    })
  }

  writeNode(container, document)
}

/** Read containers directly: doc.toJSON() discards LoroText marks. */
export const loroRichTextToTiptap = (container: LoroMap): TiptapDocument => {
  const readNode = (map: LoroMap): unknown => {
    const attributes = map.get("attributes")
    const children = map.get("children")
    if (attributes !== undefined && !(attributes instanceof LoroMap)) {
      throw new InvalidCrdtUpdateError({ reason: "SchemaValidation" })
    }
    if (children !== undefined && !(children instanceof LoroList)) {
      throw new InvalidCrdtUpdateError({ reason: "SchemaValidation" })
    }
    const decodedAttributes =
      attributes instanceof LoroMap
        ? Schema.decodeUnknownSync(JsonAttributes)(Record.fromEntries(attributes.entries()))
        : {}

    return {
      type: map.get("nodeName"),
      ...(Record.size(decodedAttributes) > 0 ? { attrs: decodedAttributes } : {}),
      ...(children instanceof LoroList &&
      (Boolean(children.length) || map.get("nodeName") === "doc")
        ? {
            content: children.toArray().flatMap((child): unknown[] => {
              if (child instanceof LoroMap) return [readNode(child)]
              if (!(child instanceof LoroText)) {
                throw new InvalidCrdtUpdateError({ reason: "SchemaValidation" })
              }

              return child.toDelta().map((delta) => {
                const marks = Record.toEntries(delta.attributes ?? {}).map(([type, attrs]) => ({
                  type,
                  ...(Record.size(Schema.decodeUnknownSync(JsonAttributes)(attrs)) > 0
                    ? { attrs }
                    : {}),
                }))

                return {
                  type: "text",
                  text: delta.insert,
                  ...(EffectArray.isReadonlyArrayNonEmpty(marks) ? { marks } : {}),
                }
              })
            }),
          }
        : {}),
    }
  }

  return Schema.decodeUnknownSync(TiptapDocument)({
    ...Schema.decodeUnknownSync(JsonAttributes)(readNode(container)),
    version: 1,
  })
}
