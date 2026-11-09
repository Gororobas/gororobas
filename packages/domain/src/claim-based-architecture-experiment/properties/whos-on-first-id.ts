import { WhosOnFirstId } from "../../common/external-identifiers.js"
import { defineProperty } from "../property.js"

/** Set on places the gazetteer created, which keeps their shape and hierarchy. */
export const WhosOnFirstIdProperty = defineProperty({
  id: "whosOnFirstId",
  value: WhosOnFirstId,
  subjectKinds: ["PLACE"],
  scope: "UNIVERSAL",
  cardinality: "ONE",
  presence: "OPTIONAL",
  sources: ["WHOS_ON_FIRST", "PERSON"],
})
