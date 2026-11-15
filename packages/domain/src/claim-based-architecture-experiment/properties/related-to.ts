import { Option } from "effect"

import { WikiArticleId } from "../../common/ids.js"
import { everyKind } from "../kinds.js"
import { defineCanonicalProperty } from "../property.js"

/**
 * The weakest relation. People may assert it when they know two articles relate but not how,
 * evaluated like their other proposals. Entity references people place in article text assert it
 * too. It's never inferred: a contributor who knows how two articles relate says so explicitly.
 */
export const RelatedToProperty = defineCanonicalProperty({
  id: "relatedTo",
  valueSchema: WikiArticleId,
  kinds: everyKind,
  scope: "UNIVERSAL",
  cardinality: "SET",
  sources: (source) => [source.person(), source.articleTextEntityReference()],
  references: { targetKinds: everyKind, target: Option.some },
})
