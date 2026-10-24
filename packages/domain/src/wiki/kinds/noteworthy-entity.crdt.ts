import { NoteworthyEntityType } from "@gororobas/domain/common/enums"
import { Effect, Schema } from "effect"

import { defineCrdtOperations } from "../../crdts/define-crdt-operations.js"
import { makeOptionalScalarEditOperations } from "../../crdts/optional-scalar-edit-operations.js"
import { type NoteworthyEntityEditableAttributes } from "./noteworthy-entity.js"

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
})

export const WikiNoteworthyEntityArticleCrdtOperations = defineCrdtOperations([
  ...entityTypeOperations,
  ...foundedDateOperations,
  ...dissolvedDateOperations,
  ...urlOperations,
])

export type WikiNoteworthyEntityArticleAttributeEdit =
  typeof WikiNoteworthyEntityArticleCrdtOperations.AttributeEdit.Type
