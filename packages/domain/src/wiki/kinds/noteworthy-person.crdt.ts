import { Effect, Schema } from "effect"

import { NameInCrdtList, ValidName } from "../../common/primitives.js"
import { makeMovableListEditOperations } from "../../crdts/movable-list-edit-operations.js"
import { makeOptionalScalarEditOperations } from "../../crdts/optional-scalar-edit-operations.js"
import { defineKindCrdtOperations } from "./define-kind-crdt-operations.js"
import type { NoteworthyPersonEditableAttributes } from "./noteworthy-person.js"

const namesOperations = makeMovableListEditOperations("Name")({
  ValueSchema: NameInCrdtList.schema.fields.value,
  getContainer: (document) =>
    Effect.succeed(
      document
        .getMap("attributes")
        .ensureMergeableMovableList("names" satisfies keyof NoteworthyPersonEditableAttributes),
    ),
})

const areasOfWorkOperations = makeMovableListEditOperations("AreaOfWork")({
  ValueSchema: NameInCrdtList.schema.fields.value,
  getContainer: (document) =>
    Effect.succeed(
      document
        .getMap("attributes")
        .ensureMergeableMovableList(
          "areasOfWork" satisfies keyof NoteworthyPersonEditableAttributes,
        ),
    ),
})

const birthDateOperations = makeOptionalScalarEditOperations("BirthDate")({
  ValueSchema: Schema.String,
  getParentContainer: (document) => Effect.succeed(document.getMap("attributes")),
  keyInParentContainer: "birthDate" satisfies keyof NoteworthyPersonEditableAttributes,
})

const deathDateOperations = makeOptionalScalarEditOperations("DeathDate")({
  ValueSchema: Schema.String,
  getParentContainer: (document) => Effect.succeed(document.getMap("attributes")),
  keyInParentContainer: "deathDate" satisfies keyof NoteworthyPersonEditableAttributes,
})

const occupationsOperations = makeMovableListEditOperations("Occupation")({
  ValueSchema: NameInCrdtList.schema.fields.value,
  getContainer: (document) =>
    Effect.succeed(
      document
        .getMap("attributes")
        .ensureMergeableMovableList(
          "occupations" satisfies keyof NoteworthyPersonEditableAttributes,
        ),
    ),
})

const locationOperations = makeOptionalScalarEditOperations("Location")({
  ValueSchema: ValidName,
  getParentContainer: (document) => Effect.succeed(document.getMap("attributes")),
  keyInParentContainer: "location" satisfies keyof NoteworthyPersonEditableAttributes,
})

const urlOperations = makeOptionalScalarEditOperations("Url")({
  ValueSchema: Schema.URLFromString,
  getParentContainer: (document) => Effect.succeed(document.getMap("attributes")),
  keyInParentContainer: "url" satisfies keyof NoteworthyPersonEditableAttributes,
})

export const WikiNoteworthyPersonArticleCrdtOperations = defineKindCrdtOperations([
  ...namesOperations,
  ...areasOfWorkOperations,
  ...birthDateOperations,
  ...deathDateOperations,
  ...occupationsOperations,
  ...locationOperations,
  ...urlOperations,
])
export type WikiNoteworthyPersonArticleAttributeEdit =
  typeof WikiNoteworthyPersonArticleCrdtOperations.AttributeEdit.Type
