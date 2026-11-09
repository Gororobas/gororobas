import { Option, Schema } from "effect"

import { SupportedLanguage } from "../../common/enums.js"
import { everyKind } from "../kinds.js"
import { defineProperty } from "../property.js"
import { Name, sameName } from "../values/name.js"

/**
 * The article's title in a language: today's first common name. Wikipedia and Wikidata call it a
 * label; the other names are `aliases`. Splitting them removes the only ordered list we had.
 *
 * Google Books asserts a label per edition language, so a book gets its title in every language it
 * was published in without a machine editing anything people wrote.
 */
export const LabelProperty = defineProperty({
  id: "label",
  value: Name,
  subjectKinds: everyKind,
  scope: "LANGUAGE_SPECIFIC",
  cardinality: "ONE",
  presence: "REQUIRED",
  sources: ["PERSON", "WHOS_ON_FIRST", "GOOGLE_BOOKS", "MACHINE_TRANSLATION"],
  sameValue: sameName,
  extract: {
    GOOGLE_BOOKS: (result) =>
      result.editions.flatMap((edition) =>
        Schema.is(Name.fields.name)(edition.title)
          ? edition.languages.flatMap((tag) =>
              Option.toArray(
                Option.liftPredicate(tag.slice(0, 2), Schema.is(SupportedLanguage)),
              ).map((language) => ({
                language,
                value: Name.make({ name: edition.title, grammaticalGender: null }),
              })),
            )
          : [],
      ),
  },
})
