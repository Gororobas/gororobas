import { defineProperty } from "../property.js"
import { FoldedName } from "../values/folded-name.js"

/** What an uncategorized article might become; changing kind itself isn't a claim. */
export const SuggestedKindProperty = defineProperty({
  id: "suggestedKind",
  valueSchema: FoldedName,
  kinds: ["UNCATEGORIZED"],
  scope: "UNIVERSAL",
  cardinality: "ONE",
  presence: "OPTIONAL",
  sources: (source) => [source.person()],
})
