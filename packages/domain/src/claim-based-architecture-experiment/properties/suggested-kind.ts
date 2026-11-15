import { defineCanonicalProperty } from "../property.js"
import { NameWithNormalizedEquivalence } from "../values/name-with-normalized-equivalence.js"

/** What an uncategorized article might become; changing kind itself isn't a claim. */
export const SuggestedKindProperty = defineCanonicalProperty({
  id: "suggestedKind",
  valueSchema: NameWithNormalizedEquivalence,
  kinds: ["UNCATEGORIZED"],
  scope: "UNIVERSAL",
  cardinality: "ONE",
  presence: "OPTIONAL",
  sources: (source) => [source.person()],
})
