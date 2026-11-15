import { NonEmptyTrimmedString } from "../../common/primitives.js"
import { defineCanonicalProperty } from "../property.js"

/** Named as schema.org names it. */
export const CreditTextProperty = defineCanonicalProperty({
  id: "creditText",
  valueSchema: NonEmptyTrimmedString,
  kinds: ["RESOURCE"],
  scope: "UNIVERSAL",
  cardinality: "ONE",
  presence: "OPTIONAL",
  sources: (source) => [source.person()],
  schemaOrg: { match: "EXACT", encode: (creditText) => ({ creditText }) },
})
