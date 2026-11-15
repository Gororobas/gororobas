import { defineCanonicalProperty } from "../property.js"
import { ArticleOrName, articleOf } from "../values/article-or-name.js"

export const BasedInProperty = defineCanonicalProperty({
  id: "basedIn",
  valueSchema: ArticleOrName,
  kinds: ["NOTEWORTHY_PERSON", "NOTEWORTHY_ENTITY"],
  scope: "UNIVERSAL",
  cardinality: "SET",
  sources: (source) => [source.person()],
  references: { targetKinds: ["PLACE"], target: articleOf },
})
