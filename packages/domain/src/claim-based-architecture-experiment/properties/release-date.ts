import { PartialDate } from "../../common/utils/dates.js"
import { defineProperty } from "../property.js"

export const ReleaseDateProperty = defineProperty({
  id: "releaseDate",
  valueSchema: PartialDate,
  kinds: ["FILM"],
  scope: "UNIVERSAL",
  cardinality: "ONE",
  presence: "OPTIONAL",
  sources: ["PERSON"],
})
