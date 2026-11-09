import { Option } from "effect"

import { WikiArticleId } from "../../common/ids.js"
import { everyKind } from "../kinds.js"
import { defineProperty } from "../property.js"

/**
 * Today's `wiki_article_relations`: the weakest relation. People may assert it when they know two
 * articles relate but not how, reviewed like their other claims; legacy tags migrate as such
 * claims. Inferred ones are visible by default with a notice, and disputable. A typed relation
 * (`growsIn`) says more, and the edit form should offer one first.
 */
export const RelatedToProperty = defineProperty({
  id: "relatedTo",
  value: WikiArticleId,
  subjectKinds: everyKind,
  scope: "UNIVERSAL",
  cardinality: "SET",
  mergeStrategy: "ALL_SOURCES",
  sources: ["PERSON", "ARTICLE_TEXT_REFERENCE", "ARTICLE_TEXT_INFERENCE"],
  references: { kinds: everyKind, target: Option.some },
})
