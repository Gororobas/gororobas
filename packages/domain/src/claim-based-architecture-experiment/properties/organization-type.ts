import { NoteworthyEntityType } from "../../common/enums.js"
import { defineProperty } from "../property.js"

/** Today's noteworthy entity `entityType`, the only required attribute of that kind. */
export const OrganizationTypeProperty = defineProperty({
  id: "organizationType",
  valueSchema: NoteworthyEntityType,
  kinds: ["NOTEWORTHY_ENTITY"],
  scope: "UNIVERSAL",
  cardinality: "ONE",
  presence: "REQUIRED",
  sources: ["PERSON"],
})
