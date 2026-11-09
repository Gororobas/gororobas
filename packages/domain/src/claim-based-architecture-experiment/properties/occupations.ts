import { ValidName } from "../../common/primitives.js"
import { defineProperty } from "../property.js"

/** Language-dependent free text in an `ARTICLE` property: see the README's open questions. */
export const OccupationsProperty = defineProperty({
  id: "occupations",
  value: ValidName,
  subjectKinds: ["NOTEWORTHY_PERSON"],
  scope: "UNIVERSAL",
  cardinality: "SET",
  mergeStrategy: "ALL_SOURCES",
  sources: ["PERSON"],
})
