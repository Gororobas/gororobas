import { NonEmptyTrimmedString } from "../../common/primitives.js"
import { defineProperty } from "../property.js"

/** Today's book `edition` ("2nd edition, revised"). See `datePublished` on works vs editions. */
export const EditionLabelProperty = defineProperty({
  id: "editionLabel",
  valueSchema: NonEmptyTrimmedString,
  kinds: ["BOOK"],
  scope: "UNIVERSAL",
  cardinality: "ONE",
  presence: "OPTIONAL",
  sources: (source) => [source.person()],
})
