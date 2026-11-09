import { NonEmptyTrimmedString } from "../../common/primitives.js"
import { defineProperty } from "../property.js"

export const CreditLineProperty = defineProperty({
  id: "creditLine",
  valueSchema: NonEmptyTrimmedString,
  kinds: ["RESOURCE"],
  scope: "UNIVERSAL",
  cardinality: "ONE",
  presence: "OPTIONAL",
  sources: ["PERSON"],
})
