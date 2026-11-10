import { Result, Schema } from "effect"

import { defineProperty } from "../property.js"
import { Syntropedia } from "../providers/syntropedia.js"
import { Wikidata, WikidataProperty } from "../providers/wikidata.js"
import { FoldedName } from "../values/folded-name.js"

/**
 * In order, the accepted name first and its synonyms after. GBIF ranks first: it knows the
 * accepted name, and while it has any, its names replace people's. People still name and order
 * what GBIF can't match (or hasn't been fetched), and legacy data comes with names. Wikidata's
 * taxon name (P225) only shows when neither has one: it often lists a synonym. Syntropedia's
 * comes last, with the synonyms its comments list. Cultivar names
 * ('Cherokee Purple') are names, not scientific names. schema.org has none: `Taxon` lacks one,
 * and Bioschemas' profile would need checking.
 */
export const ScientificNamesProperty = defineProperty({
  id: "scientificNames",
  valueSchema: FoldedName,
  kinds: ["PLANT", "PLANT_CULTIVAR", "ANIMAL"],
  scope: "UNIVERSAL",
  cardinality: "LIST",
  mergeStrategy: "FIRST_SOURCE_WITH_VALUES",
  sources: (source) => [
    source.gbif({
      extract: (result) =>
        result.classification
          .filter((rank) => rank.taxonRank === "SPECIES")
          .map((rank) => rank.scientificName)
          .filter(Schema.is(FoldedName))
          .map(source.found),
    }),
    source.person(),
    source.wikidata({
      extract: (entity) =>
        Wikidata.statements(entity, WikidataProperty.TAXON_NAME).map((statement) =>
          Result.flatMap(Wikidata.string(statement, FoldedName), source.found),
        ),
    }),
    source.syntropedia({
      extract: (plant) =>
        Syntropedia.scientificNames(plant).filter(Schema.is(FoldedName)).map(source.found),
    }),
  ],
})
