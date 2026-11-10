import { GbifClassification } from "../../wiki/external-data/kinds/plant-external-data.js"
import { defineProperty } from "../property.js"

/** Today's `wiki_plant_taxonomy_classification`: one value per rank, only from GBIF. */
export const TaxonomicClassificationProperty = defineProperty({
  id: "taxonomicClassification",
  valueSchema: GbifClassification,
  kinds: ["PLANT"],
  scope: "UNIVERSAL",
  cardinality: "SET",
  mergeStrategy: "ALL_SOURCES",
  sources: (source) => [
    source.gbif({ extract: (result) => result.classification.map(source.found) }),
  ],
})
