import { ResourceFormat } from "../../common/enums.js"
import { defineProperty } from "../property.js"

export const ResourceFormatProperty = defineProperty({
  id: "resourceFormat",
  value: ResourceFormat,
  subjectKinds: ["RESOURCE"],
  scope: "UNIVERSAL",
  cardinality: "ONE",
  presence: "REQUIRED",
  sources: ["PERSON"],
})
