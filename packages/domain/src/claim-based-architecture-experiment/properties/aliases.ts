import { everyKind } from "../kinds.js"
import { defineProperty } from "../property.js"
import { Name, sameName } from "../values/name.js"

/**
 * Other names in a language. Absorbs today's common names after the first, and the `names` of
 * noteworthy people and content producers.
 * Scientific names stay their own property: they name a taxon, belong to no language, and come
 * from GBIF.
 */
export const AliasesProperty = defineProperty({
  id: "aliases",
  value: Name,
  subjectKinds: everyKind,
  scope: "LANGUAGE_SPECIFIC",
  cardinality: "SET",
  mergeStrategy: "ALL_SOURCES",
  sources: ["PERSON", "WHOS_ON_FIRST"],
  sameValue: sameName,
})
