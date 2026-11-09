import { PartialDate } from "../../common/utils/dates.js"
import { defineProperty } from "../property.js"

/**
 * Today's book attributes describe one edition (publisher, date, pages, edition label), while
 * Google Books returns many (`bookEditions`). Deciding whether a BOOK article is a work or an
 * edition would decide whether these stay, or move into `bookEditions` as people-authored values.
 */
export const PublicationDateProperty = defineProperty({
  id: "publicationDate",
  value: PartialDate,
  subjectKinds: ["BOOK"],
  scope: "UNIVERSAL",
  cardinality: "ONE",
  presence: "OPTIONAL",
  sources: ["PERSON"],
})
