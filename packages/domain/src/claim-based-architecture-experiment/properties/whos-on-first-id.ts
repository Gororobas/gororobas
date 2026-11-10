import { WhosOnFirstId } from "../../common/external-identifiers.js"
import { defineProperty } from "../property.js"

/** Set on places the gazetteer created, which keeps their shape and hierarchy. */
export const WhosOnFirstIdProperty = defineProperty({
  id: "whosOnFirstId",
  valueSchema: WhosOnFirstId,
  kinds: ["PLACE"],
  scope: "UNIVERSAL",
  cardinality: "ONE",
  presence: "OPTIONAL",
  sources: (source) => [
    // The ID the place was looked up by: what creates the claim on an article the gazetteer makes.
    source.whosOnFirst({ extract: (place) => [source.found(place.id)] }),
    source.person(),
  ],
  schemaOrg: {
    match: "EXACT",
    encode: (id) => ({ sameAs: `https://spelunker.whosonfirst.org/id/${id}` }),
  },
})
