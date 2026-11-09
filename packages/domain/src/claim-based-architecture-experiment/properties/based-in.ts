import { defineProperty } from "../property.js"
import { ArticleOrName, articleOf } from "../values/article-or-name.js"

/** Today's noteworthy person `location`, free text. */
export const BasedInProperty = defineProperty({
  id: "basedIn",
  value: ArticleOrName,
  subjectKinds: ["NOTEWORTHY_PERSON", "NOTEWORTHY_ENTITY"],
  scope: "UNIVERSAL",
  cardinality: "SET",
  mergeStrategy: "ALL_SOURCES",
  sources: ["PERSON", "TEXT_INFERENCE"],
  references: { kinds: ["PLACE"], target: articleOf },
})
