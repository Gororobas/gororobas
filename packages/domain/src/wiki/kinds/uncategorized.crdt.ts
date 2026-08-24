import { Effect } from "effect"

import { NonEmptyTrimmedString } from "../../common/primitives.js"
import { makeOptionalScalarEditOperations } from "../../crdts/optional-scalar-edit-operations.js"
import { defineKindCrdtOperations } from "./define-kind-crdt-operations.js"
import { WikiUncategorizedArticle } from "./uncategorized.js"

const suggestedKindOperations = makeOptionalScalarEditOperations("SuggestedKind")({
  ValueSchema: NonEmptyTrimmedString,
  getParentContainer: (document) => Effect.succeed(document.getMap("attributes")),
  keyInParentContainer:
    "suggestedKind" satisfies keyof typeof WikiUncategorizedArticle.EditableAttributes.Type,
})

export const WikiUncategorizedArticleCrdtOperations =
  defineKindCrdtOperations(suggestedKindOperations)
export type WikiUncategorizedArticleAttributeEdit =
  typeof WikiUncategorizedArticleCrdtOperations.AttributeEdit.Type
