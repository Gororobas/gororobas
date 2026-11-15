import { NoteworthyEntityType } from "../../common/enums.js"
import { defineCanonicalProperty } from "../property.js"

export const OrganizationTypeProperty = defineCanonicalProperty({
  id: "organizationType",
  valueSchema: NoteworthyEntityType,
  kinds: ["NOTEWORTHY_ENTITY"],
  scope: "UNIVERSAL",
  cardinality: "ONE",
  presence: "REQUIRED",
  sources: (source) => [source.person()],
})
