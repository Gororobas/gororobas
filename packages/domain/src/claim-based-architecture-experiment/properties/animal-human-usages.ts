import { AnimalHumanUsage } from "../../common/enums.js"
import { defineCanonicalProperty } from "../property.js"

export const AnimalHumanUsagesProperty = defineCanonicalProperty({
  id: "animalHumanUsages",
  valueSchema: AnimalHumanUsage,
  kinds: ["ANIMAL"],
  scope: "UNIVERSAL",
  cardinality: "SET",
  sources: (source) => [source.person()],
})
