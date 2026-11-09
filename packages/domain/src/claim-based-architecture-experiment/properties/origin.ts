import { NonEmptyTrimmedString } from "../../common/primitives.js"
import { defineProperty } from "../property.js"

/** Today's plant translation field `origin`: plain text per language, machine-translatable. */
export const OriginProperty = defineProperty({
  id: "origin",
  value: NonEmptyTrimmedString,
  subjectKinds: ["PLANT"],
  scope: "LANGUAGE_SPECIFIC",
  cardinality: "ONE",
  presence: "OPTIONAL",
  sources: ["PERSON", "MACHINE_TRANSLATION"],
})
