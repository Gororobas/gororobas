import { Option, Schema } from "effect"

import { defineCanonicalProperty } from "../property.js"

/**
 * Whether the seeds need treatment (scarification, stratification…) before they germinate.
 *
 * A botanical fact: Syntropedia's answer is canonical over people's proposals.
 */
export const SeedDormancyProperty = defineCanonicalProperty({
  id: "seedDormancy",
  valueSchema: Schema.Boolean,
  kinds: ["PLANT", "PLANT_CULTIVAR"],
  scope: "UNIVERSAL",
  cardinality: "ONE",
  sources: (source) => [
    source.syntropedia({
      extract: (plant) =>
        Option.toArray(Option.fromNullishOr(plant.seedDormancy)).map(source.found),
    }),
    source.person(),
  ],
  inheritance: { through: ["cultivarOf"], mode: "BY_CHOICE" },
})
