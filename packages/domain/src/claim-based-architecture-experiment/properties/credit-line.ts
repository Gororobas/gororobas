import { NonEmptyTrimmedString } from "../../common/primitives.js"
import { defineProperty } from "../property.js"

export const CreditLineProperty = defineProperty({
  id: "creditLine",
  value: NonEmptyTrimmedString,
  subjectKinds: ["RESOURCE"],
  scope: "ARTICLE_WIDE",
  cardinality: "ONE",
  presence: "OPTIONAL",
  sources: ["PERSON"],
})
