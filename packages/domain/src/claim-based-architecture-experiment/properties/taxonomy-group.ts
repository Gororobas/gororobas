import { Option, Schema } from "effect"

import { defineProperty } from "../property.js"

/** Today's `wiki_plant_taxonomy_group`. */
export const TaxonomyGroupProperty = defineProperty({
  id: "taxonomyGroup",
  valueSchema: Schema.NonEmptyString,
  kinds: ["PLANT"],
  scope: "UNIVERSAL",
  cardinality: "ONE",
  presence: "OPTIONAL",
  sources: ["GBIF"],
  extract: {
    GBIF: (result) =>
      Option.toArray(
        Option.liftPredicate(result.taxonomyGroup ?? "", Schema.is(Schema.NonEmptyString)),
      ).map((value) => ({ value })),
  },
})
