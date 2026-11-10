import { Option, Schema } from "effect"

import { defineProperty } from "../property.js"

/** Whether the seeds need treatment (scarification, stratification…) before they germinate. */
export const SeedDormancyProperty = defineProperty({
  id: "seedDormancy",
  valueSchema: Schema.Boolean,
  kinds: ["PLANT", "PLANT_CULTIVAR"],
  scope: "UNIVERSAL",
  cardinality: "ONE",
  sources: (source) => [
    source.person(),
    source.syntropedia({
      extract: (plant) =>
        Option.toArray(Option.fromNullishOr(plant.seedDormancy)).map(source.found),
    }),
  ],
})
