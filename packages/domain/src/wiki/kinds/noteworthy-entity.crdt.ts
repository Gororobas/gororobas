import { Effect, Schema } from "effect"

import { NoteworthyEntityType } from "../../common/enums.js"
import { makeMovableListEditOperations } from "../../crdts/movable-list-edit-operations.js"
import { makeOptionalScalarEditOperations } from "../../crdts/optional-scalar-edit-operations.js"
import { defineKindCrdtOperations } from "./define-kind-crdt-operations.js"
import {
  WikiNoteworthyEntityArticle,
  type NoteworthyEntityEditableAttributes,
} from "./noteworthy-entity.js"

const namesOperations = makeMovableListEditOperations("Name")({
  ValueSchema: WikiNoteworthyEntityArticle.EditableAttributes.fields.names,
  getContainer: (document) =>
    Effect.succeed(
      document
        .getMap("attributes")
        .ensureMergeableMovableList("names" satisfies keyof NoteworthyEntityEditableAttributes),
    ),
})

const areasOfWorkOperations = makeMovableListEditOperations("AreaOfWork")({
  ValueSchema: WikiNoteworthyEntityArticle.EditableAttributes.fields.areasOfWork,
  getContainer: (document) =>
    Effect.succeed(
      document
        .getMap("attributes")
        .ensureMergeableMovableList(
          "areasOfWork" satisfies keyof NoteworthyEntityEditableAttributes,
        ),
    ),
})

const entityTypeOperations = makeOptionalScalarEditOperations("EntityType")({
  ValueSchema: NoteworthyEntityType,
  getParentContainer: (document) => Effect.succeed(document.getMap("attributes")),
  keyInParentContainer: "entityType" satisfies keyof NoteworthyEntityEditableAttributes,
})

const foundedDateOperations = makeOptionalScalarEditOperations("FoundedDate")({
  ValueSchema: Schema.String,
  getParentContainer: (document) => Effect.succeed(document.getMap("attributes")),
  keyInParentContainer: "foundedDate" satisfies keyof NoteworthyEntityEditableAttributes,
})

const dissolvedDateOperations = makeOptionalScalarEditOperations("DissolvedDate")({
  ValueSchema: Schema.String,
  getParentContainer: (document) => Effect.succeed(document.getMap("attributes")),
  keyInParentContainer: "dissolvedDate" satisfies keyof NoteworthyEntityEditableAttributes,
})

const urlOperations = makeOptionalScalarEditOperations("Url")({
  ValueSchema: Schema.URLFromString,
  getParentContainer: (document) => Effect.succeed(document.getMap("attributes")),
  keyInParentContainer: "url" satisfies keyof NoteworthyEntityEditableAttributes,
  encodeValue: (value) => Effect.succeed(value.toString()),
})

export const WikiNoteworthyEntityArticleCrdtOperations = defineKindCrdtOperations([
  ...namesOperations,
  ...areasOfWorkOperations,
  ...entityTypeOperations,
  ...foundedDateOperations,
  ...dissolvedDateOperations,
  ...urlOperations,
])
export type WikiNoteworthyEntityArticleAttributeEdit =
  typeof WikiNoteworthyEntityArticleCrdtOperations.AttributeEdit.Type
