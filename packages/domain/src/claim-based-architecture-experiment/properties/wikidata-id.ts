import { WikidataId } from "../../common/external-identifiers.js"
import { defineProperty } from "../property.js"

/**
 * Identifiers drive every fetch, so no machine guesses them: people pick a record in the form's
 * Wikidata search, and the gazetteer's concordances are trusted.
 */
export const WikidataIdProperty = defineProperty({
  id: "wikidataId",
  value: WikidataId,
  subjectKinds: ["PLANT", "PLACE"],
  scope: "UNIVERSAL",
  cardinality: "ONE",
  presence: "OPTIONAL",
  sources: ["PERSON", "WHOS_ON_FIRST"],
})
