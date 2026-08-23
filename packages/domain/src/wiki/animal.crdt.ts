import { Effect, Match, Schema } from "effect"
import { type LoroDoc } from "loro-crdt"

import { AnimalRole } from "../common/enums.js"
import { NameInCrdtList } from "../common/primitives.js"
import { makeMovableListEditOperations } from "../crdts/movable-list-edit-operations.js"
import { makeStringSetEditOperations } from "../crdts/string-set-edit-operations.js"
import { AnimalEditableAttributes } from "./animal.js"

const scientificNameOperations = makeMovableListEditOperations("ScientificName")({
  ValueSchema: NameInCrdtList.schema.fields.value,
  getContainer: (document) =>
    Effect.succeed(
      document
        .getMap("attributes")
        .ensureMergeableMovableList("scientificNames" satisfies keyof AnimalEditableAttributes),
    ),
})

const animalRoleOperations = makeStringSetEditOperations("AnimalRole")({
  ValueSchema: AnimalRole,
  getContainer: (document) =>
    Effect.succeed(
      document
        .getMap("attributes")
        .ensureMergeableMap("roles" satisfies keyof AnimalEditableAttributes),
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
