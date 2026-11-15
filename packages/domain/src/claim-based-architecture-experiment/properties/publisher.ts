import { Result } from "effect"

import { defineCanonicalProperty } from "../property.js"
import { Wikidata, WikidataProperty } from "../providers/wikidata.js"
import { ArticleOrName, articleOf, articleOrNameToJsonLd } from "../values/article-or-name.js"

export const PublisherProperty = defineCanonicalProperty({
  id: "publisher",
  valueSchema: ArticleOrName,
  kinds: ["BOOK"],
  scope: "UNIVERSAL",
  cardinality: "ONE",
  presence: "OPTIONAL",
  sources: (source) => [
    source.person(),
    source.wikidata({
      extract: (entity, context) =>
        Wikidata.statements(entity, WikidataProperty.PUBLISHER).map((statement) =>
          Result.flatMap(
            Wikidata.articleOrName(statement, { context, language: "pt" }),
            source.found,
          ),
        ),
    }),
  ],
  references: { targetKinds: ["NOTEWORTHY_ENTITY"], target: articleOf },
  schemaOrg: {
    match: "EXACT",
    encode: (publisher, { context }) => ({ publisher: articleOrNameToJsonLd(publisher, context) }),
  },
})
