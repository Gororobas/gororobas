import { Option, Result } from "effect"

import { UrlAsString } from "../../common/primitives.js"
import { decodeExtractedValue } from "../extraction.js"
import { defineCanonicalProperty } from "../property.js"
import { Tmdb } from "../providers/tmdb.js"
import { Wikidata, WikidataProperty } from "../providers/wikidata.js"

export const WebsiteProperty = defineCanonicalProperty({
  id: "website",
  valueSchema: UrlAsString,
  kinds: ["BOOK", "FILM", "NOTEWORTHY_ENTITY", "NOTEWORTHY_PERSON"],
  scope: "UNIVERSAL",
  cardinality: "ONE",
  presence: "OPTIONAL",
  sources: (source) => [
    source.person(),
    source.wikidata({
      // Websites that ended (P582) aren't read: Rachel Carson's has.
      extract: (entity) =>
        Wikidata.statements(entity, WikidataProperty.OFFICIAL_WEBSITE).map((statement) =>
          Result.flatMap(Wikidata.url(statement, UrlAsString), source.found),
        ),
    }),
    source.tmdb({
      extract: (work) =>
        Option.toArray(Tmdb.homepage(work)).map((url) =>
          Result.flatMap(decodeExtractedValue(UrlAsString, url), source.found),
        ),
    }),
  ],
  schemaOrg: { match: "CLOSE", encode: (url) => ({ sameAs: url }) },
})
