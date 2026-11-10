import { IntNonNegative } from "../../common/primitives.js"
import { defineProperty } from "../property.js"

/** Today's book `pageCount`. Named as schema.org and Wikidata (P1104) name it. */
export const NumberOfPagesProperty = defineProperty({
  id: "numberOfPages",
  valueSchema: IntNonNegative,
  kinds: ["BOOK"],
  scope: "UNIVERSAL",
  cardinality: "ONE",
  presence: "OPTIONAL",
  sources: (source) => [source.person()],
  schemaOrg: { match: "EXACT", encode: (pages) => ({ numberOfPages: pages }) },
})
