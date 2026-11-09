import { GbifTaxonId } from "../../common/external-identifiers.js"
import { defineProperty } from "../property.js"

/**
 * People, GBIF and Wikidata can all assert it. A person's ID ranks first and lets GBIF be fetched
 * without Wikidata, so a change in how Wikidata models GBIF IDs can't cut plants off from GBIF.
 * When sources disagree (an outdated Wikidata entry), resolution shows the best-ranked.
 */
export const GbifTaxonIdProperty = defineProperty({
  id: "gbifTaxonId",
  value: GbifTaxonId,
  subjectKinds: ["PLANT"],
  scope: "UNIVERSAL",
  cardinality: "ONE",
  presence: "OPTIONAL",
  sources: ["PERSON", "GBIF", "WIKIDATA"],
  extract: {
    GBIF: (result) => [{ value: result.gbifTaxonId }],
    WIKIDATA: (result) => (result.gbifId?.kind === "taxon" ? [{ value: result.gbifId.id }] : []),
  },
})
