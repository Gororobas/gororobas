import { Array as EffectArray, Equal, Option, Record, Schema } from "effect"
import { LoroList, LoroMap, LoroText, type Delta } from "loro-crdt"

import { InvalidCrdtUpdateError } from "../crdts/errors.js"
import { toLoroString, toLoroValue } from "../crdts/loro-values.js"
import { TiptapDocument, type TiptapNode, type TiptapTextNode } from "./domain.js"

const JsonAttributes = Schema.Record(Schema.String, Schema.Json)
type RichTextNode = TiptapNode | TiptapTextNode | TiptapDocument

const textDeltas = (nodes: readonly TiptapTextNode[]) =>
  nodes.map((node) => ({
    insert: toLoroString(node.text),
    attributes: Record.fromEntries(
      (node.marks ?? []).map((mark) => [
        toLoroString(mark.type),
        toLoroValue(Schema.decodeSync(JsonAttributes)(mark.attrs ?? {})),
      ]),
    ),
  }))

/** Change only differing mark ranges; reasserting unchanged marks can override concurrent formatting. */
const updateRichText = (text: LoroText, nodes: readonly TiptapTextNode[]) => {
  const desired = textDeltas(nodes)
  text.update(desired.map((delta) => delta.insert).join(""))
  const current = text.toDelta()
  let currentIndex = 0
  let desiredIndex = 0
  let currentEnd = current[0]?.insert?.length ?? 0
  let desiredEnd = desired[0]?.insert?.length ?? 0
  let start = 0

  // oxlint-disable-next-line effect/imperative-loops -- Walk paired delta ranges without allocating an entry for every character.
  while (start < text.length) {
    const end = Math.min(currentEnd, desiredEnd)
    const currentAttributes = current[currentIndex]?.attributes ?? {}
    const desiredAttributes = desired[desiredIndex]?.attributes ?? {}
    const keys = EffectArray.dedupe([
      ...Record.keys(currentAttributes),
      ...Record.keys(desiredAttributes),
    ])

    keys.forEach((key) => {
      if (Equal.equals(currentAttributes[key], desiredAttributes[key])) return
      if (desiredAttributes[key] === undefined) text.unmark({ start, end }, key)
      else text.mark({ start, end }, key, desiredAttributes[key])
    })

    start = end
    if (end === currentEnd) currentEnd += current[++currentIndex]?.insert?.length ?? 0
    if (end === desiredEnd) desiredEnd += desired[++desiredIndex]?.insert?.length ?? 0
  }
}

/** Retain node and text identities while applying a new editor document. */
export const updateLoroRichText = (container: LoroMap, content: TiptapDocument) => {
  const writeNode = (map: LoroMap, node: RichTextNode): void => {
    if (map.get("nodeName") !== node.type) map.set("nodeName", toLoroString(node.type))
    const attributes = map.ensureMergeableMap("attributes")
    // oxlint-disable-next-line custom-lint-rules/no-schema-decode-unknown -- Rich-text attributes must remain JSON values at the container boundary.
    const values = Schema.decodeUnknownSync(JsonAttributes)(
      "attrs" in node ? (node.attrs ?? {}) : {},
    )
    const normalizedValues = Record.fromEntries(
      Record.toEntries(values).map(([key, value]) => [toLoroString(key), toLoroValue(value)]),
    )
    attributes.keys().forEach((key) => {
      if (!(key in normalizedValues)) attributes.delete(key)
    })
    Record.toEntries(normalizedValues).forEach(([key, value]) => {
      if (!Equal.equals(attributes.get(key), value)) attributes.set(key, value)
    })
    const children = map.ensureMergeableList("children")
    const groups: Array<TiptapNode | TiptapTextNode[]> = []

    if ("content" in node) {
      node.content?.forEach((child) => {
        const previous = groups[groups.length - 1]
        if (child.type === "text") {
          if (Array.isArray(previous)) previous.push(child)
          else groups.push([child])
        } else groups.push(child)
      })
    }

    groups.forEach((group, index) => {
      const existing = children.get(index)

      if (Array.isArray(group)) {
        if (existing instanceof LoroText) updateRichText(existing, group)
        else {
          if (existing !== undefined) children.delete(index, 1)
          const text = children.insertContainer(index, new LoroText())
          text.applyDelta(textDeltas(group))
        }
      } else if (existing instanceof LoroMap && existing.get("nodeName") === group.type) {
        writeNode(existing, group)
      } else {
        if (existing !== undefined) children.delete(index, 1)
        writeNode(children.insertContainer(index, new LoroMap()), group)
      }
    })

    if (children.length > groups.length) {
      children.delete(groups.length, children.length - groups.length)
    }
  }

  // No-op edits must not create containers or formatting operations.
  if (
    container.get("nodeName") !== undefined &&
    Equal.equals(loroRichTextToTiptap(container), content)
  ) {
    return
  }

  writeNode(container, content)
}

/**
 * Matches loro-prosemirror's nodeName/attributes/children format. Consecutive
 * ProseMirror text nodes share one LoroText, with marks represented as deltas.
 * https://github.com/loro-dev/loro-prosemirror/blob/main/src/lib.ts
 */
export const initializeLoroRichText = (container: LoroMap, document: TiptapDocument) => {
  const writeNode = (map: LoroMap, node: RichTextNode): void => {
    map.set("nodeName", toLoroString(node.type))

    if ("attrs" in node && node.attrs !== undefined) {
      const attributes = map.ensureMergeableMap("attributes")
      attributes.keys().forEach((key) => {
        attributes.delete(key)
      })
      // oxlint-disable-next-line custom-lint-rules/no-schema-decode-unknown -- Rich-text attributes may contain undefined values and must be checked for JSON compatibility.
      Record.toEntries(Schema.decodeUnknownSync(JsonAttributes)(node.attrs)).forEach(
        ([key, value]) => attributes.set(toLoroString(key), toLoroValue(value)),
      )
    } else map.delete("attributes")

    if (!("content" in node) || node.content === undefined) {
      map.delete("children")
      return
    }
    const children = map.ensureMergeableList("children")
    // Mergeable containers retain their contents after their parent key is deleted and recreated.
    if (children.length) children.delete(0, children.length)
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
            toLoroValue(Schema.decodeSync(JsonAttributes)(mark.attrs ?? {})),
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
  const readNode = (map: LoroMap): Schema.JsonObject => {
    if (map.keys().some((key) => !["nodeName", "attributes", "children"].includes(key))) {
      throw new InvalidCrdtUpdateError({ reason: "SchemaValidation" })
    }
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
        ? // oxlint-disable-next-line custom-lint-rules/no-schema-decode-unknown -- Loro attribute containers can contain non-JSON values.
          Schema.decodeUnknownSync(JsonAttributes)(Record.fromEntries(attributes.entries()))
        : {}

    return {
      // oxlint-disable-next-line custom-lint-rules/no-schema-decode-unknown -- Loro container names must be validated before projecting a JSON node.
      type: Schema.decodeUnknownSync(Schema.String)(map.get("nodeName")),
      ...(Record.size(decodedAttributes) > 0 ? { attrs: decodedAttributes } : {}),
      ...(children instanceof LoroList &&
      (Boolean(children.length) || map.get("nodeName") === "doc")
        ? {
            content: children.toArray().flatMap((child): Schema.JsonArray => {
              if (child instanceof LoroMap) return [readNode(child)]
              if (!(child instanceof LoroText)) {
                throw new InvalidCrdtUpdateError({ reason: "SchemaValidation" })
              }

              return child.toDelta().map((delta) => {
                const marks = Record.toEntries(delta.attributes ?? {}).map(([type, attributes]) => {
                  // oxlint-disable-next-line custom-lint-rules/no-schema-decode-unknown -- Loro mark attributes can contain non-JSON values.
                  const attrs = Schema.decodeUnknownSync(JsonAttributes)(attributes)
                  return { type, ...(Record.size(attrs) > 0 ? { attrs } : {}) }
                })

                return {
                  type: "text",
                  // A missing insert is not a text node; the decoder rejects malformed Loro deltas.
                  // oxlint-disable-next-line custom-lint-rules/no-schema-decode-unknown -- Loro deltas may contain retain/delete operations without a string insert.
                  text: Schema.decodeUnknownSync(Schema.String)(delta.insert),
                  ...(EffectArray.isReadonlyArrayNonEmpty(marks) ? { marks } : {}),
                }
              })
            }),
          }
        : {}),
    }
  }

  // oxlint-disable-next-line custom-lint-rules/no-schema-decode-unknown -- Loro nodes have dynamic names and children that require structural validation.
  return Schema.decodeUnknownSync(TiptapDocument, { onExcessProperty: "error" })({
    // oxlint-disable-next-line custom-lint-rules/no-schema-decode-unknown -- The recursive Loro projection returns unknown data.
    ...Schema.decodeUnknownSync(JsonAttributes)(readNode(container)),
    version: 1,
  })
}
