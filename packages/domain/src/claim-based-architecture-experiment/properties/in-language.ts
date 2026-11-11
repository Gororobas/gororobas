import { Option, Result, Schema } from "effect"

import { defineProperty } from "../property.js"
import { Tmdb } from "../providers/tmdb.js"
import { Wikidata, WikidataProperty } from "../providers/wikidata.js"

/** BCP 47 tags, not `SupportedLanguage`: works exist in languages Gororobas isn't written in. */
export const LanguageTag = Schema.String.check(
  Schema.isPattern(/^[a-z]{2,3}(-[A-Za-z0-9]+)*$/),
).pipe(Schema.brand("LanguageTag"))

/**
 * The languages a work's content is in: what a book is written in, what a film's people speak,
 * what a video or a podcast episode is narrated in. Named as schema.org names it: `languages`
 * alone didn't say whether it was the work's or its subject's. Today's book `language` and film
 * `languages`.
 */
export const InLanguageProperty = defineProperty({
  id: "inLanguage",
  valueSchema: LanguageTag,
  kinds: ["BOOK", "FILM", "RESOURCE"],
  scope: "UNIVERSAL",
  cardinality: "SET",
  mergeStrategy: "ALL_SOURCES",
  sources: (source) => [
    source.tmdb({
      extract: (work) => Tmdb.languageTags(work).filter(Schema.is(LanguageTag)).map(source.found),
    }),
    source.googleBooks({
      extract: (result) =>
        result.editions
          .flatMap((edition) => edition.languages)
          .filter(Schema.is(LanguageTag))
          .map(source.found),
    }),
    source.contentChannels({
      // Channels declare tags in any case (`pt-BR`, `EN`); ours start lowercase.
      extract: (item) =>
        Option.toArray(Option.fromNullishOr(item.language))
          .map((tag) => tag.replace(/^[A-Za-z]+/, (subtag) => subtag.toLowerCase()))
          .filter(Schema.is(LanguageTag))
          .map(source.found),
    }),
    source.person(),
    source.wikidata({
      // Language items as their IETF tag (P305): American English (Q7976) is `en-US`.
      extract: (entity, context) =>
        [WikidataProperty.LANGUAGE_OF_WORK, WikidataProperty.ORIGINAL_LANGUAGE_OF_FILM]
          .flatMap((property) => Wikidata.statements(entity, property))
          .map((statement) =>
            Result.flatMap(
              Wikidata.languageTag(statement, { context, schema: LanguageTag }),
              source.found,
            ),
          ),
    }),
  ],
  schemaOrg: { match: "EXACT", encode: (tag) => ({ inLanguage: tag }) },
})
