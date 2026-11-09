import { AnimalRole } from "../../common/enums.js"
import { defineProperty } from "../property.js"

export const AnimalRolesProperty = defineProperty({
  id: "animalRoles",
  valueSchema: AnimalRole,
  kinds: ["ANIMAL"],
  scope: "UNIVERSAL",
  cardinality: "SET",
  mergeStrategy: "ALL_SOURCES",
  sources: ["PERSON"],
})
