import { defineCanonicalProperty } from "../property.js"
import { NameWithNormalizedEquivalence } from "../values/name-with-normalized-equivalence.js"

/** Language-dependent free text in an `ARTICLE` property: see the README's open questions. */
export const OccupationsProperty = defineCanonicalProperty({
  id: "occupations",
  valueSchema: NameWithNormalizedEquivalence,
  kinds: ["NOTEWORTHY_PERSON"],
  scope: "UNIVERSAL",
  cardinality: "SET",
  sources: (source) => [source.person()],
})
