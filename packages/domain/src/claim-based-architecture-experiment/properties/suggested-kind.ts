import { defineProperty } from "../property.js"
import { FoldedName } from "../values/folded-name.js"

/** What an uncategorized article might become; changing kind itself isn't a claim. */
export const SuggestedKindProperty = defineProperty({
  id: "suggestedKind",
  value: FoldedName,
  subjectKinds: ["UNCATEGORIZED"],
  scope: "UNIVERSAL",
  cardinality: "ONE",
  presence: "OPTIONAL",
  sources: ["PERSON"],
})
