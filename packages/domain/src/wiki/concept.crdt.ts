import { Effect, Match, Schema } from "effect"
import { type LoroDoc } from "loro-crdt"

import { TagId } from "../common/ids.js"
import { makeStringSetEditOperations } from "../crdts/string-set-edit-operations.js"
import { ConceptMaterializedAttributes } from "./concept.js"

const conceptTagOperations = makeStringSetEditOperations("ConceptTag")({
  ValueSchema: TagId,
  getContainer: (document) =>
    Effect.succeed(
      document
        .getMap("attributes")
        .ensureMergeableMap("tags" satisfies keyof ConceptMaterializedAttributes),
    ),
})

export const ConceptAttributeEdit = Schema.Union([
  conceptTagOperations.added.message,
  conceptTagOperations.removed.message,
]).pipe(Schema.toTaggedUnion("_tag"))
export type ConceptAttributeEdit = typeof ConceptAttributeEdit.Type

export const applyConceptAttributeEdit = (document: LoroDoc, change: ConceptAttributeEdit) =>
  Match.value(change).pipe(
    Match.tagsExhaustive({
      AddedConceptTag: (message) => conceptTagOperations.added.handler(document, message),
      RemovedConceptTag: (message) => conceptTagOperations.removed.handler(document, message),
    }),
  )
