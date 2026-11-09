import { GbifClassification } from "../../wiki/external-data/kinds/plant-external-data.js"
import { defineProperty } from "../property.js"

/** Today's `wiki_plant_taxonomy_classification`: one value per rank, only from GBIF. */
export const TaxonomicClassificationProperty = defineProperty({
  id: "taxonomicClassification",
  value: GbifClassification,
  subjectKinds: ["PLANT"],
  scope: "ARTICLE_WIDE",
  cardinality: "SET",
  mergeStrategy: "ALL_SOURCES",
  sources: ["GBIF"],
  sameValue: (self, that) => self.taxonRank === that.taxonRank,
  extract: {
    GBIF: (result) => result.classification.map((value) => ({ value })),
  },
})
