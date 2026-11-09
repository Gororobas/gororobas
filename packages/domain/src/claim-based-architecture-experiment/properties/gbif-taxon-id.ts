import { GbifTaxonId } from "../../common/external-identifiers.js"
import { defineProperty } from "../property.js"

/**
 * Two providers asserting one value: Wikidata points to the taxon, GBIF confirms the one it
 * matched. When they disagree (an outdated Wikidata entry), both values show with their sources.
 */
export const GbifTaxonIdProperty = defineProperty({
  id: "gbifTaxonId",
  value: GbifTaxonId,
  subjectKinds: ["PLANT"],
  scope: "ARTICLE_WIDE",
  cardinality: "ONE",
  presence: "OPTIONAL",
  sources: ["GBIF", "WIKIDATA"],
  extract: {
    GBIF: (result) => [{ value: result.gbifTaxonId }],
    WIKIDATA: (result) => (result.gbifId?.kind === "taxon" ? [{ value: result.gbifId.id }] : []),
  },
})
