import { Effect, Match, Schema } from "effect"
import { type LoroDoc } from "loro-crdt"

import { AnimalRole } from "../common/enums.js"
import { NameInCrdtList } from "../common/primitives.js"
import { generateMovableListOperations } from "../crdts/movable-list.js"
import { generateStringHashSetOperations } from "../crdts/string-hash-set.js"
import { AnimalAttributes } from "./animal.js"

const scientificNameOperations = generateMovableListOperations("ScientificName")({
  ValueSchema: NameInCrdtList.schema.fields.value,
  getContainer: (document) =>
    Effect.succeed(
      document
        .getMap("attributes")
        .ensureMergeableMovableList("scientificNames" satisfies keyof AnimalAttributes),
    ),
})

const animalRoleOperations = generateStringHashSetOperations("AnimalRole")({
  ValueSchema: AnimalRole,
  getContainer: (document) =>
    Effect.succeed(
      document.getMap("attributes").ensureMergeableMap("roles" satisfies keyof AnimalAttributes),
    ),
})

export const AnimalAttributeEdit = Schema.Union([
  scientificNameOperations.added.message,
  scientificNameOperations.removed.message,
  scientificNameOperations.updated.message,
  scientificNameOperations.moved.message,
  animalRoleOperations.added.message,
  animalRoleOperations.removed.message,
]).pipe(Schema.toTaggedUnion("_tag"))
export type AnimalAttributeEdit = typeof AnimalAttributeEdit.Type

export const applyAnimalAttributeEdit = (document: LoroDoc, change: AnimalAttributeEdit) =>
  Match.value(change).pipe(
    Match.tagsExhaustive({
      AddedScientificName: (message) => scientificNameOperations.added.handler(document, message),
      MovedScientificName: (message) => scientificNameOperations.moved.handler(document, message),
      RemovedScientificName: (message) =>
        scientificNameOperations.removed.handler(document, message),
      UpdatedScientificName: (message) =>
        scientificNameOperations.updated.handler(document, message),
      AddedAnimalRole: (message) => animalRoleOperations.added.handler(document, message),
      RemovedAnimalRole: (message) => animalRoleOperations.removed.handler(document, message),
    }),
  )
