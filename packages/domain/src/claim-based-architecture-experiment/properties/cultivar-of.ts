import { Option } from "effect"

import { WikiArticleId } from "../../common/ids.js"
import { defineProperty } from "../property.js"

/** Today's `parentPlantId`. The plant must be published, checked on the server. */
export const CultivarOfProperty = defineProperty({
  id: "cultivarOf",
  valueSchema: WikiArticleId,
  kinds: ["PLANT_CULTIVAR"],
  scope: "UNIVERSAL",
  cardinality: "ONE",
  presence: "REQUIRED",
  sources: ["PERSON"],
  references: { targetKinds: ["PLANT"], target: Option.some },
})
