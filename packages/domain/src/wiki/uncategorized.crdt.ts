import { Effect, Match, Schema } from "effect"
import { type LoroDoc } from "loro-crdt"

import { NonEmptyTrimmedString } from "../common/primitives.js"
import { generateStringHashSetOperations } from "../crdts/string-hash-set.js"
import { UncategorizedAttributes } from "./uncategorized.js"

const suggestedKindOperations = generateStringHashSetOperations("SuggestedKind")({
  ValueSchema: NonEmptyTrimmedString,
  getContainer: (document) =>
    Effect.succeed(
      document
        .getMap("attributes")
        .ensureMergeableMap("suggestedKind" satisfies keyof UncategorizedAttributes),
    ),
})

export const UncategorizedAttributeEdit = Schema.Union([
  suggestedKindOperations.added.message,
  suggestedKindOperations.removed.message,
]).pipe(Schema.toTaggedUnion("_tag"))
export type UncategorizedAttributeEdit = typeof UncategorizedAttributeEdit.Type

export const applyUncategorizedAttributeEdit = (
  document: LoroDoc,
  change: UncategorizedAttributeEdit,
) =>
  Match.value(change).pipe(
    Match.tagsExhaustive({
      AddedSuggestedKind: (message) => suggestedKindOperations.added.handler(document, message),
      RemovedSuggestedKind: (message) => suggestedKindOperations.removed.handler(document, message),
    }),
  )
