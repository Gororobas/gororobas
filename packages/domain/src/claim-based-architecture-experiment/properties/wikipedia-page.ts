import { Option, Schema } from "effect"

import { SupportedLanguage } from "../../common/enums.js"
import { UrlAsString } from "../../common/primitives.js"
import { defineProperty } from "../property.js"

/** Today's `wiki_article_external_links`. */
export const WikipediaPageProperty = defineProperty({
  id: "wikipediaPage",
  valueSchema: UrlAsString,
  kinds: ["PLANT", "PLACE"],
  scope: "LANGUAGE_SPECIFIC",
  cardinality: "ONE",
  presence: "OPTIONAL",
  sources: ["WIKIDATA"],
  extract: {
    WIKIDATA: (result) =>
      result.wikipediaLinks.flatMap((link) =>
        Option.toArray(Option.liftPredicate(link.language, Schema.is(SupportedLanguage))).map(
          (language) => ({ language, value: link.url }),
        ),
      ),
  },
})
