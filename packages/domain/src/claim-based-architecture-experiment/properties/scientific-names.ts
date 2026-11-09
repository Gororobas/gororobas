import { Schema } from "effect"

import { defineProperty } from "../property.js"
import { FoldedName } from "../values/folded-name.js"

/**
 * GBIF ranks first: it knows the accepted name. People still name what GBIF can't match (or
 * hasn't been fetched), and legacy data comes with names. Cultivar names ('Cherokee Purple') are
 * labels, not scientific names.
 */
export const ScientificNamesProperty = defineProperty({
  id: "scientificNames",
  value: FoldedName,
  subjectKinds: ["PLANT", "PLANT_CULTIVAR", "ANIMAL"],
  scope: "UNIVERSAL",
  cardinality: "SET",
  mergeStrategy: "FIRST_SOURCE_WITH_VALUES",
  sources: ["GBIF", "PERSON"],
  extract: {
    GBIF: (result) =>
      result.classification
        .filter((rank) => rank.taxonRank === "SPECIES")
        .map((rank) => rank.scientificName)
        .filter(Schema.is(FoldedName))
        .map((value) => ({ value })),
  },
})
