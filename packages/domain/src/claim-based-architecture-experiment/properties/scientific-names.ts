import { Schema } from "effect"

import { defineProperty } from "../property.js"
import { FoldedName } from "../values/folded-name.js"

/**
 * In order, the accepted name first and its synonyms after. GBIF ranks first: it knows the
 * accepted name, and while it has any, its names replace people's. People still name and order
 * what GBIF can't match (or hasn't been fetched), and legacy data comes with names. Cultivar names
 * ('Cherokee Purple') are names, not scientific names.
 */
export const ScientificNamesProperty = defineProperty({
  id: "scientificNames",
  valueSchema: FoldedName,
  kinds: ["PLANT", "PLANT_CULTIVAR", "ANIMAL"],
  scope: "UNIVERSAL",
  cardinality: "LIST",
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
