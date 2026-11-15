import { Schema } from "effect"

import { UrlAsString } from "../../common/primitives.js"
import { defineCanonicalProperty } from "../property.js"
import { Wikidata } from "../providers/wikidata.js"

/** Wikidata's sitelinks. */
export const WikipediaPageProperty = defineCanonicalProperty({
  id: "wikipediaPage",
  valueSchema: UrlAsString,
  kinds: ["PLANT", "PLACE"],
  scope: "LANGUAGE_SPECIFIC",
  cardinality: "ONE",
  sources: (source) => [
    source.wikidata({
      extract: (entity) =>
        Wikidata.wikipediaPages(entity).flatMap(({ language, url }) =>
          Schema.is(UrlAsString)(url) ? [source.found({ language, value: url })] : [],
        ),
    }),
  ],
  schemaOrg: { match: "EXACT", encode: (url) => ({ sameAs: url }) },
})
