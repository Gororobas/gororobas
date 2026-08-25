import { Effect, Schema } from "effect"

import { ResourceFormat } from "../../common/enums.js"
import { makeOptionalScalarEditOperations } from "../../crdts/optional-scalar-edit-operations.js"
import { defineKindCrdtOperations } from "./define-kind-crdt-operations.js"
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

export const WikiResourceArticleCrdtOperations = defineKindCrdtOperations([
  ...formatOperations,
  ...urlOperations,
])
export type WikiResourceArticleAttributeEdit =
  typeof WikiResourceArticleCrdtOperations.AttributeEdit.Type
