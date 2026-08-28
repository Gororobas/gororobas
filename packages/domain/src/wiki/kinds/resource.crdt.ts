import { Effect, Schema } from "effect"

import { ResourceFormat } from "../../common/enums.js"
import { TagId } from "../../common/ids.js"
import { makeOptionalScalarEditOperations } from "../../crdts/optional-scalar-edit-operations.js"
import { makeStringSetEditOperations } from "../../crdts/string-set-edit-operations.js"
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

const creditLineOperations = makeOptionalScalarEditOperations("CreditLine")({
  ValueSchema: Schema.String,
  getParentContainer: (document) => Effect.succeed(document.getMap("attributes")),
  keyInParentContainer: "creditLine" satisfies keyof ResourceEditableAttributes,
})

const resourceTagOperations = makeStringSetEditOperations("ResourceTag")({
  ValueSchema: TagId,
  getContainer: (document) =>
    Effect.succeed(document.getMap("attributes").ensureMergeableMap("tags")),
})

export const WikiResourceArticleCrdtOperations = defineKindCrdtOperations([
  ...formatOperations,
  ...urlOperations,
  ...creditLineOperations,
  ...resourceTagOperations,
])
export type WikiResourceArticleAttributeEdit =
  typeof WikiResourceArticleCrdtOperations.AttributeEdit.Type
