import { type Editor, Extension } from "@tiptap/core"
import { Plugin, PluginKey } from "@tiptap/pm/state"
import { Array as EffectArray, HashSet, MutableHashSet, Predicate, Schema } from "effect"

import { TiptapNodeId } from "../common/ids.js"
import { createTiptapNodeId, IDENTIFIED_NODE_TYPES } from "./node-ids.js"

const nodeIdPluginKey = new PluginKey("nodeId")
const identifiedNodeTypes = HashSet.fromIterable<string>(IDENTIFIED_NODE_TYPES)
const isTiptapNodeId = Schema.is(TiptapNodeId)

/** Assigns IDs to a document loaded before the extension could see its transactions. */
export const ensureTiptapNodeIds = (editor: Editor): void => {
  editor.view.dispatch(
    editor.state.tr.setMeta(nodeIdPluginKey, true).setMeta("addToHistory", false),
  )
}

/**
 * Live-editing counterpart of `assignTiptapNodeIds`: every identified node keeps a `nodeId` that
 * is unique within the document, so it survives collaborative edits and copies.
 */
export const NodeIdExtension = Extension.create({
  name: "nodeId",
  onCreate() {
    ensureTiptapNodeIds(this.editor)
  },
  addGlobalAttributes() {
    return [
      {
        types: [...IDENTIFIED_NODE_TYPES],
        attributes: {
          nodeId: {
            default: null,
            keepOnSplit: false,
            parseHTML: (element) => element.getAttribute("data-node-id"),
            renderHTML: (attributes) =>
              Predicate.isString(attributes["nodeId"])
                ? { "data-node-id": attributes["nodeId"] }
                : {},
          },
        },
      },
    ]
  },
  addProseMirrorPlugins() {
    return [
      new Plugin({
        key: nodeIdPluginKey,
        // oxlint-disable-next-line custom-lint-rules/no-many-function-parameters -- ProseMirror's plugin API.
        appendTransaction: (transactions, _oldState, newState) => {
          if (
            !transactions.some(
              (transaction) => transaction.docChanged || transaction.getMeta(nodeIdPluginKey),
            )
          ) {
            return null
          }

          const transaction = newState.tr
          const seen = MutableHashSet.empty<string>()

          newState.doc.descendants((node, position) => {
            if (!HashSet.has(identifiedNodeTypes, node.type.name)) return
            const nodeId: unknown = node.attrs["nodeId"]
            if (isTiptapNodeId(nodeId) && !MutableHashSet.has(seen, nodeId)) {
              MutableHashSet.add(seen, nodeId)
              return
            }
            const nextNodeId = createTiptapNodeId()
            transaction.setNodeMarkup(position, undefined, { ...node.attrs, nodeId: nextNodeId })
            MutableHashSet.add(seen, nextNodeId)
          })

          return EffectArray.isReadonlyArrayNonEmpty(transaction.steps) ? transaction : null
        },
      }),
    ]
  },
})
