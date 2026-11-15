import { Option, Schema } from "effect"

import { defineCanonicalProperty } from "../property.js"

export const TaxonomyGroupProperty = defineCanonicalProperty({
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
