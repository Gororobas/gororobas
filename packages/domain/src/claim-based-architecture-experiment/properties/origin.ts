import { NonEmptyTrimmedString } from "../../common/primitives.js"
import { defineCanonicalProperty } from "../property.js"

/**
 * Where the plant comes from by current botanical understanding, as plain text per language,
 * machine-translatable. Canonical, not where it grows: that's `cultivationExperience`.
 */
export const OriginProperty = defineCanonicalProperty({
  id: "origin",
  valueSchema: NonEmptyTrimmedString,
  kinds: ["PLANT"],
  scope: "LANGUAGE_SPECIFIC",
  cardinality: "ONE",
  presence: "OPTIONAL",
  sources: (source) => [source.person(), source.machineTranslation()],
})
