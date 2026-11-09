import { AnimalRole } from "../../common/enums.js"
import { defineProperty } from "../property.js"

export const AnimalRolesProperty = defineProperty({
  id: "animalRoles",
  value: AnimalRole,
  subjectKinds: ["ANIMAL"],
  scope: "UNIVERSAL",
  cardinality: "SET",
  mergeStrategy: "ALL_SOURCES",
  sources: ["PERSON"],
})
