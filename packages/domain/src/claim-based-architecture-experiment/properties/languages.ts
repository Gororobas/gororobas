import { Schema } from "effect"

import { defineProperty } from "../property.js"

/** BCP 47 tags, not `SupportedLanguage`: works exist in languages Gororobas isn't written in. */
const LanguageTag = Schema.String.check(Schema.isPattern(/^[a-z]{2,3}(-[A-Za-z0-9]+)*$/)).pipe(
  Schema.brand("LanguageTag"),
)

/** Today's book `language` and film `languages`. */
export const LanguagesProperty = defineProperty({
  id: "languages",
  value: LanguageTag,
  subjectKinds: ["BOOK", "FILM"],
  scope: "ARTICLE_WIDE",
  cardinality: "SET",
  mergeStrategy: "ALL_SOURCES",
  sources: ["PERSON", "GOOGLE_BOOKS"],
  extract: {
    GOOGLE_BOOKS: (result) =>
      result.editions
        .flatMap((edition) => edition.languages)
        .filter(Schema.is(LanguageTag))
        .map((value) => ({ value })),
  },
})
