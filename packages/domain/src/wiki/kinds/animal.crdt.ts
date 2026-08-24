import { Effect } from "effect"

import { AnimalRole } from "../../common/enums.js"
import { NameInCrdtList } from "../../common/primitives.js"
import { makeMovableListEditOperations } from "../../crdts/movable-list-edit-operations.js"
import { makeStringSetEditOperations } from "../../crdts/string-set-edit-operations.js"
import type { AnimalEditableAttributes } from "./animal.js"
import { defineKindCrdtOperations } from "./define-kind-crdt-operations.js"

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

export const WikiAnimalArticleCrdtOperations = defineKindCrdtOperations([
  ...scientificNameOperations,
  ...animalRoleOperations,
])
export type WikiAnimalArticleAttributeEdit =
  typeof WikiAnimalArticleCrdtOperations.AttributeEdit.Type
