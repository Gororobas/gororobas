import { Effect, Match, Schema } from "effect"
import { type LoroDoc } from "loro-crdt"

import { ToolUsage } from "../common/enums.js"
import { makeStringSetEditOperations } from "../crdts/string-set-edit-operations.js"
import { ToolEditableAttributes } from "./tool.js"

const toolUsageOperations = makeStringSetEditOperations("ToolUsage")({
  ValueSchema: ToolUsage,
  getContainer: (document) =>
    Effect.succeed(
      document
        .getMap("attributes")
        .ensureMergeableMap("usage" satisfies keyof ToolEditableAttributes),
    ),
})

export const ToolAttributeEdit = Schema.Union([
  toolUsageOperations.added.message,
  toolUsageOperations.removed.message,
]).pipe(Schema.toTaggedUnion("_tag"))
export type ToolAttributeEdit = typeof ToolAttributeEdit.Type

export const applyToolAttributeEdit = (document: LoroDoc, change: ToolAttributeEdit) =>
  Match.value(change).pipe(
    Match.tagsExhaustive({
      AddedToolUsage: (message) => toolUsageOperations.added.handler(document, message),
      RemovedToolUsage: (message) => toolUsageOperations.removed.handler(document, message),
    }),
  )
