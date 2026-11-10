import { NonEmptyTrimmedString } from "../../common/primitives.js"
import { defineProperty } from "../property.js"

/** Today's resource `creditLine`, named as schema.org names it. */
export const CreditTextProperty = defineProperty({
  id: "creditText",
  valueSchema: NonEmptyTrimmedString,
  kinds: ["RESOURCE"],
  scope: "UNIVERSAL",
  cardinality: "ONE",
  presence: "OPTIONAL",
  sources: (source) => [source.person()],
  schemaOrg: { match: "EXACT", encode: (creditText) => ({ creditText }) },
})
