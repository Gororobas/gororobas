import { defineProperty } from "../property.js"
import { FoldedName } from "../values/folded-name.js"

/** Language-dependent free text in an `ARTICLE` property: see the README's open questions. */
export const OccupationsProperty = defineProperty({
  id: "occupations",
  value: FoldedName,
  subjectKinds: ["NOTEWORTHY_PERSON"],
  scope: "UNIVERSAL",
  cardinality: "SET",
  mergeStrategy: "ALL_SOURCES",
  sources: ["PERSON"],
})
