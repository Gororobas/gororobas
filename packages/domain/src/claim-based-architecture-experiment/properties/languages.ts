import { Result, Schema } from "effect"

import { defineProperty } from "../property.js"
import { Wikidata, WikidataProperty } from "../providers/wikidata.js"

/** BCP 47 tags, not `SupportedLanguage`: works exist in languages Gororobas isn't written in. */
export const LanguageTag = Schema.String.check(
  Schema.isPattern(/^[a-z]{2,3}(-[A-Za-z0-9]+)*$/),
).pipe(Schema.brand("LanguageTag"))

/** Today's book `language` and film `languages`. */
export const LanguagesProperty = defineProperty({
  id: "languages",
  valueSchema: LanguageTag,
  kinds: ["BOOK", "FILM"],
  scope: "UNIVERSAL",
  cardinality: "SET",
  mergeStrategy: "ALL_SOURCES",
  sources: (source) => [
    source.person(),
    source.wikidata({
      // Language items as their IETF tag (P305): American English (Q7976) is `en-US`.
      extract: (entity, context) =>
        Wikidata.statements(entity, WikidataProperty.LANGUAGE_OF_WORK).map((statement) =>
          Result.flatMap(
            Wikidata.languageTag(statement, { context, schema: LanguageTag }),
            source.found,
          ),
        ),
    }),
    source.googleBooks({
      extract: (result) =>
        result.editions
          .flatMap((edition) => edition.languages)
          .filter(Schema.is(LanguageTag))
          .map(source.found),
    }),
  ],
  schemaOrg: { match: "EXACT", encode: (tag) => ({ inLanguage: tag }) },
})
