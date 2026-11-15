import { AnimalEcologicalFunction } from "../../common/enums.js"
import { defineCanonicalProperty } from "../property.js"

export const AnimalEcologicalFunctionsProperty = defineCanonicalProperty({
  id: "animalEcologicalFunctions",
  valueSchema: AnimalEcologicalFunction,
  kinds: ["ANIMAL"],
  scope: "UNIVERSAL",
  cardinality: "SET",
  sources: (source) => [source.person()],
})
