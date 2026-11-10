import { Option, Schema } from "effect"

import { defineProperty } from "../property.js"

/** Today's `wiki_plant_taxonomy_group`, now for animals too. */
export const TaxonomyGroupProperty = defineProperty({
  id: "taxonomyGroup",
  valueSchema: Schema.NonEmptyString,
  kinds: ["PLANT", "ANIMAL"],
  scope: "UNIVERSAL",
  cardinality: "ONE",
  sources: (source) => [
    source.gbif({
      extract: (result) =>
        Option.toArray(
          Option.liftPredicate(result.taxonomyGroup ?? "", Schema.is(Schema.NonEmptyString)),
        ).map(source.found),
    }),
  ],
})
