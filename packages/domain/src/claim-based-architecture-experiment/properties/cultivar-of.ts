import { Option } from "effect"

import { WikiArticleId } from "../../common/ids.js"
import { defineProperty } from "../property.js"

/** Today's `parentPlantId`. The plant must be published, checked on the server. */
export const CultivarOfProperty = defineProperty({
  id: "cultivarOf",
  value: WikiArticleId,
  subjectKinds: ["PLANT_CULTIVAR"],
  scope: "ARTICLE_WIDE",
  cardinality: "ONE",
  presence: "REQUIRED",
  sources: ["PERSON"],
  references: { kinds: ["PLANT"], target: Option.some },
})
