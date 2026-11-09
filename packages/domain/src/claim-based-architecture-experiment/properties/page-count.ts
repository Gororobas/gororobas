import { IntNonNegative } from "../../common/primitives.js"
import { defineProperty } from "../property.js"

export const PageCountProperty = defineProperty({
  id: "pageCount",
  value: IntNonNegative,
  subjectKinds: ["BOOK"],
  scope: "UNIVERSAL",
  cardinality: "ONE",
  presence: "OPTIONAL",
  sources: ["PERSON"],
})
