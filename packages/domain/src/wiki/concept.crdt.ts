import { Effect, Match, Schema } from "effect"
import { type LoroDoc } from "loro-crdt"

import { TagId } from "../common/ids.js"
import { generateStringHashSetOperations } from "../crdts/string-hash-set.js"
import { ConceptAttributes } from "./concept.js"

const conceptRoleOperations = generateStringHashSetOperations("ConceptRole")({
  ValueSchema: TagId,
  getContainer: (document) =>
    Effect.succeed(
      document.getMap("attributes").ensureMergeableMap("tags" satisfies keyof ConceptAttributes),
    ),
})

export const ConceptAttributeEdit = Schema.Union([
  conceptRoleOperations.added.message,
  conceptRoleOperations.removed.message,
]).pipe(Schema.toTaggedUnion("_tag"))
export type ConceptAttributeEdit = typeof ConceptAttributeEdit.Type

export const applyConceptAttributeEdit = (document: LoroDoc, change: ConceptAttributeEdit) =>
  Match.value(change).pipe(
    Match.tagsExhaustive({
      AddedConceptRole: (message) => conceptRoleOperations.added.handler(document, message),
      RemovedConceptRole: (message) => conceptRoleOperations.removed.handler(document, message),
    }),
  )
