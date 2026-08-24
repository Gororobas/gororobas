import { Effect } from "effect"

import { TagId } from "../../common/ids.js"
import { makeStringSetEditOperations } from "../../crdts/string-set-edit-operations.js"
import { WikiConceptArticle } from "./concept.js"
import { defineKindCrdtOperations } from "./define-kind-crdt-operations.js"

const conceptTagOperations = makeStringSetEditOperations("ConceptTag")({
  ValueSchema: TagId,
  getContainer: (document) =>
    Effect.succeed(
      document
        .getMap("attributes")
        .ensureMergeableMap(
          "tags" satisfies keyof typeof WikiConceptArticle.MaterializedAttributes.Type,
        ),
    ),
})

export const WikiConceptArticleCrdtOperations = defineKindCrdtOperations(conceptTagOperations)
export type WikiConceptArticleAttributeEdit =
  typeof WikiConceptArticleCrdtOperations.AttributeEdit.Type
