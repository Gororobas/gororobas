import { Effect, Schema } from "effect"

import { ResourceFormat } from "../../common/enums.js"
import { defineCrdtOperations } from "../../crdts/define-crdt-operations.js"
import { makeOptionalScalarEditOperations } from "../../crdts/optional-scalar-edit-operations.js"
import type { ResourceEditableAttributes } from "./resource.js"

const formatOperations = makeOptionalScalarEditOperations("Format")({
  ValueSchema: ResourceFormat,
  getParentContainer: (document) => Effect.succeed(document.getMap("attributes")),
  keyInParentContainer: "format" satisfies keyof ResourceEditableAttributes,
})

const urlOperations = makeOptionalScalarEditOperations("Url")({
  ValueSchema: Schema.URLFromString,
  getParentContainer: (document) => Effect.succeed(document.getMap("attributes")),
  keyInParentContainer: "url" satisfies keyof ResourceEditableAttributes,
})

const creditLineOperations = makeOptionalScalarEditOperations("CreditLine")({
  ValueSchema: Schema.String,
  getParentContainer: (document) => Effect.succeed(document.getMap("attributes")),
  keyInParentContainer: "creditLine" satisfies keyof ResourceEditableAttributes,
})

export const WikiResourceArticleCrdtOperations = defineCrdtOperations([
  ...formatOperations,
  ...urlOperations,
  ...creditLineOperations,
])

export type WikiResourceArticleAttributeEdit =
  typeof WikiResourceArticleCrdtOperations.AttributeEdit.Type
