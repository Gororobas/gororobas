import { Option, Schema } from "effect"

import { WikiArticleId } from "../../common/ids.js"
import { defineProperty } from "../property.js"

/**
 * New: an authored relation, with a qualifier as part of its value. Text inference reads it from
 * publications ("o mamão até que cresce bem no Cerrado"), shown with its quote and disputable.
 */
export const GrowsInProperty = defineProperty({
  id: "growsIn",
  valueSchema: Schema.Struct({
    place: WikiArticleId,
    nativity: Schema.NullOr(Schema.Literals(["NATIVE", "INTRODUCED"])),
  }),
  kinds: ["PLANT", "PLANT_CULTIVAR"],
  scope: "UNIVERSAL",
  cardinality: "SET",
  mergeStrategy: "ALL_SOURCES",
  sources: ["PERSON", "ARTICLE_TEXT_INFERENCE"],
  references: { targetKinds: ["PLACE"], target: ({ place }) => Option.some(place) },
})
