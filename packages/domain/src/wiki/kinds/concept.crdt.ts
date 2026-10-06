import { Effect } from "effect"

import { TagId } from "../../common/ids.js"
import { defineCrdtOperations } from "../../crdts/define-crdt-operations.js"
import { makeStringSetEditOperations } from "../../crdts/string-set-edit-operations.js"
import { WikiConceptArticle } from "./concept.js"

const conceptTagOperations = makeStringSetEditOperations("ConceptTag")({
  ValueSchema: TagId,
  getContainer: (document) =>
    Effect.succeed(
      document
        .getMap("attributes")
        .ensureMergeableMap(
          "tags" satisfies keyof typeof WikiConceptArticle.ProjectedAttributes.Type,
        ),
    ),
})

export const WikiConceptArticleCrdtOperations = defineCrdtOperations(conceptTagOperations)
export type WikiConceptArticleAttributeEdit =
  typeof WikiConceptArticleCrdtOperations.AttributeEdit.Type
