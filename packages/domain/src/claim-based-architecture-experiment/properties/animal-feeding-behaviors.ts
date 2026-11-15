import { AnimalFeedingBehavior } from "../../common/enums.js"
import { defineCanonicalProperty } from "../property.js"

export const AnimalFeedingBehaviorsProperty = defineCanonicalProperty({
  id: "animalFeedingBehaviors",
  valueSchema: AnimalFeedingBehavior,
  kinds: ["ANIMAL"],
  scope: "UNIVERSAL",
  cardinality: "SET",
  sources: (source) => [source.person()],
})
