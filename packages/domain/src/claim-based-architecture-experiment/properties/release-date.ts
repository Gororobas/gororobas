import { PartialDate } from "../../common/utils/dates.js"
import { defineProperty } from "../property.js"

export const ReleaseDateProperty = defineProperty({
  id: "releaseDate",
  value: PartialDate,
  subjectKinds: ["FILM"],
  scope: "UNIVERSAL",
  cardinality: "ONE",
  presence: "OPTIONAL",
  sources: ["PERSON"],
})
