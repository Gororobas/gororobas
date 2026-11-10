import { defineProperty } from "../property.js"
import { ArticleOrName, articleOf } from "../values/article-or-name.js"

/** Today's noteworthy person `location`, free text. */
export const BasedInProperty = defineProperty({
  id: "basedIn",
  valueSchema: ArticleOrName,
  kinds: ["NOTEWORTHY_PERSON", "NOTEWORTHY_ENTITY"],
  scope: "UNIVERSAL",
  cardinality: "SET",
  mergeStrategy: "ALL_SOURCES",
  sources: (source) => [source.person(), source.articleTextInference()],
  references: { targetKinds: ["PLACE"], target: articleOf },
})
