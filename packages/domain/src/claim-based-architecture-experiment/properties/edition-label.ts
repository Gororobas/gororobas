import { NonEmptyTrimmedString } from "../../common/primitives.js"
import { defineCanonicalProperty } from "../property.js"

/** See `datePublished` on works vs editions. */
export const EditionLabelProperty = defineCanonicalProperty({
  id: "editionLabel",
  valueSchema: NonEmptyTrimmedString,
  kinds: ["BOOK"],
  scope: "UNIVERSAL",
  cardinality: "ONE",
  presence: "OPTIONAL",
  sources: (source) => [source.person()],
})
