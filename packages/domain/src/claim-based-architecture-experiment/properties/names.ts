import { Option, Schema } from "effect"

import { GrammaticalGender, SupportedLanguage } from "../../common/enums.js"
import { everyKind } from "../kinds.js"
import { defineProperty } from "../property.js"
import { FoldedName } from "../values/folded-name.js"

/**
 * One of an article's names: today's `WikiArticleCommonName`. A different grammatical gender is a
 * different value, so correcting it is a change.
 */
export const Name = Schema.Struct({
  name: FoldedName,
  grammaticalGender: Schema.NullOr(GrammaticalGender),
})

export type Name = typeof Name.Type

/**
 * What people call the article, per language, in order: today's `commonNames`. No name is
 * canonical; the first is the one most people recognize, and it's the default title. Readers may
 * see another first (the name they searched for, "maize" over "corn"), chosen when reading.
 *
 * A handle is minted from the first name people gave in a language (or the gazetteer's), never
 * from a machine's, and never replaced afterwards, so links keep working.
 *
 * Google Books asserts each edition's title in its language, so a book is named in every language
 * it was published in without a machine editing anything people wrote. Its names follow people's.
 * Scientific names are their own property: they name a taxon and belong to no language.
 */
export const NamesProperty = defineProperty({
  id: "names",
  value: Name,
  subjectKinds: everyKind,
  scope: "LANGUAGE_SPECIFIC",
  cardinality: "LIST",
  mergeStrategy: "ALL_SOURCES",
  presence: "REQUIRED",
  sources: ["PERSON", "WHOS_ON_FIRST", "GOOGLE_BOOKS", "MACHINE_TRANSLATION"],
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
