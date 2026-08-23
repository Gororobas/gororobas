import { Effect, Match, Schema } from "effect"
import { type LoroDoc } from "loro-crdt"

import { NonEmptyTrimmedString } from "../common/primitives.js"
import { makeOptionalScalarEditOperations } from "../crdts/optional-scalar-edit-operations.js"
import { UncategorizedAttributes } from "./uncategorized.js"

const suggestedKindOperations = makeOptionalScalarEditOperations("SuggestedKind")({
  ValueSchema: NonEmptyTrimmedString,
  getParentContainer: (document) => Effect.succeed(document.getMap("attributes")),
  keyInParentContainer: "suggestedKind" satisfies keyof UncategorizedAttributes,
})

export const UncategorizedAttributeEdit = Schema.Union([
  suggestedKindOperations.set.message,
  suggestedKindOperations.unset.message,
]).pipe(Schema.toTaggedUnion("_tag"))
export type UncategorizedAttributeEdit = typeof UncategorizedAttributeEdit.Type

export const applyUncategorizedAttributeEdit = (
  document: LoroDoc,
  change: UncategorizedAttributeEdit,
) =>
  Match.value(change).pipe(
    Match.tagsExhaustive({
      SetSuggestedKind: (message) => suggestedKindOperations.set.handler(document, message),
      UnsetSuggestedKind: (message) => suggestedKindOperations.unset.handler(document, message),
    }),
  )
