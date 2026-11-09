import { WikidataId } from "../../common/external-identifiers.js"
import { everyKind } from "../kinds.js"
import { defineProperty } from "../property.js"

/**
 * Identifiers drive every fetch, so no machine guesses them: people pick a record in the form's
 * Wikidata search, and the gazetteer's concordances are trusted. Every kind can have one: Silent
 * Spring is Q591623, Ana Primavesi Q10265006.
 */
export const WikidataIdProperty = defineProperty({
  id: "wikidataId",
  valueSchema: WikidataId,
  kinds: everyKind,
  scope: "UNIVERSAL",
  cardinality: "ONE",
  presence: "OPTIONAL",
  sources: ["PERSON", "WHOS_ON_FIRST"],
})
