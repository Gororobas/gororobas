import { Effect } from "effect"

import { ToolUsage } from "../../common/enums.js"
import { makeStringSetEditOperations } from "../../crdts/string-set-edit-operations.js"
import { defineKindCrdtOperations } from "./define-kind-crdt-operations.js"
import { WikiToolArticle } from "./tool.js"

const toolUsageOperations = makeStringSetEditOperations("ToolUsage")({
  ValueSchema: ToolUsage,
  getContainer: (document) =>
    Effect.succeed(
      document
        .getMap("attributes")
        .ensureMergeableMap("usage" satisfies keyof typeof WikiToolArticle.EditableAttributes.Type),
    ),
})

export const WikiToolArticleCrdtOperations = defineKindCrdtOperations(toolUsageOperations)
export type WikiToolArticleAttributeEdit = typeof WikiToolArticleCrdtOperations.AttributeEdit.Type
