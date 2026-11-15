import { GbifClassification } from "../../wiki/external-data/kinds/plant-external-data.js"
import { defineCanonicalProperty } from "../property.js"

/**
 * One value per rank, only from GBIF. It's also where scientific names come from: the most specific rank's name (a species, or
 * a genus for taxa like Musa). Cultivars have no GBIF taxon, so they show their plant's.
 */
export const TaxonomicClassificationProperty = defineCanonicalProperty({
  id: "taxonomicClassification",
  valueSchema: GbifClassification,
  kinds: ["PLANT", "PLANT_CULTIVAR", "ANIMAL"],
  scope: "UNIVERSAL",
  cardinality: "SET",
  sources: (source) => [
    source.gbif({ extract: (result) => result.classification.map(source.found) }),
  ],
  inheritance: { through: ["cultivarOf"], mode: "ALONGSIDE" },
})
