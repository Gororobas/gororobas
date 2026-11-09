import { NonEmptyTrimmedString } from "../../common/primitives.js"
import { defineProperty } from "../property.js"

/** Today's book `edition` ("2nd edition, revised"). See `publicationDate` on works vs editions. */
export const EditionLabelProperty = defineProperty({
  id: "editionLabel",
  value: NonEmptyTrimmedString,
  subjectKinds: ["BOOK"],
  scope: "ARTICLE_WIDE",
  cardinality: "ONE",
  presence: "OPTIONAL",
  sources: ["PERSON"],
})
