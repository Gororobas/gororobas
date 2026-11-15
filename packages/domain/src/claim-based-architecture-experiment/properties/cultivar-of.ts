import { Option } from "effect"

import { WikiArticleId } from "../../common/ids.js"
import { defineCanonicalProperty } from "../property.js"

/** The plant must be published, checked on the server. */
export const CultivarOfProperty = defineCanonicalProperty({
  id: "cultivarOf",
  valueSchema: WikiArticleId,
  kinds: ["PLANT_CULTIVAR"],
  scope: "UNIVERSAL",
  cardinality: "ONE",
  presence: "REQUIRED",
  sources: (source) => [source.person()],
  references: { targetKinds: ["PLANT"], target: Option.some },
})
