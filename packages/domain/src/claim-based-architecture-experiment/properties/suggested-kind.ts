import { ValidName } from "../../common/primitives.js"
import { defineProperty } from "../property.js"

/** What an uncategorized article might become; changing kind itself isn't a claim. */
export const SuggestedKindProperty = defineProperty({
  id: "suggestedKind",
  value: ValidName,
  subjectKinds: ["UNCATEGORIZED"],
  scope: "UNIVERSAL",
  cardinality: "ONE",
  presence: "OPTIONAL",
  sources: ["PERSON"],
})
