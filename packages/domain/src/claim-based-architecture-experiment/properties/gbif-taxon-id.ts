import { Result } from "effect"

import { GbifTaxonId } from "../../common/external-identifiers.js"
import { defineProperty } from "../property.js"
import { Wikidata, WikidataProperty } from "../providers/wikidata.js"

/**
 * People, GBIF and Wikidata can all assert it. A person's ID ranks first and lets GBIF be fetched
 * without Wikidata, so a change in how Wikidata models GBIF IDs can't cut plants off from GBIF.
 * When sources disagree (an outdated Wikidata entry), resolution shows the best-ranked.
 */
export const GbifTaxonIdProperty = defineProperty({
  id: "gbifTaxonId",
  valueSchema: GbifTaxonId,
  kinds: ["PLANT"],
  scope: "UNIVERSAL",
  cardinality: "ONE",
  sources: (source) => [
    source.person(),
    source.gbif({ extract: (result) => [source.found(result.gbifTaxonId)] }),
    source.wikidata({
      extract: (entity) =>
        Wikidata.statements(entity, WikidataProperty.GBIF_TAXON_ID).map((statement) =>
          Result.flatMap(Wikidata.externalId(statement, GbifTaxonId), source.found),
        ),
    }),
  ],
  schemaOrg: {
    match: "EXACT",
    encode: (taxonId) => ({ sameAs: `https://www.gbif.org/species/${taxonId}` }),
  },
})
