import { AnimalProductionSystem } from "../../common/enums.js"
import { defineCanonicalProperty } from "../property.js"

export const AnimalProductionSystemsProperty = defineCanonicalProperty({
  id: "animalProductionSystems",
  valueSchema: AnimalProductionSystem,
  kinds: ["ANIMAL"],
  scope: "UNIVERSAL",
  cardinality: "SET",
  sources: (source) => [source.person()],
})
