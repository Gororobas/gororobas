import { Option, Schema } from "effect"

import { GrammaticalGender } from "../../common/enums.js"
import { everyKind } from "../kinds.js"
import { defineProperty } from "../property.js"
import { FoldedName } from "../values/folded-name.js"
import { supportedLanguageOf } from "../values/supported-language.js"

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
 * Wikidata's labels and aliases, Google Books' edition titles and channels' item titles are each
 * their source's claims, so an article is named in every language they know without a machine
 * editing anything people wrote. They follow people's names, in source order.
 * Scientific names are their own property: they name a taxon and belong to no language.
 */
export const NamesProperty = defineProperty({
  id: "names",
  valueSchema: Name,
  kinds: everyKind,
  scope: "LANGUAGE_SPECIFIC",
  cardinality: "LIST",
  mergeStrategy: "ALL_SOURCES",
  presence: "REQUIRED",
  sources: [
    "PERSON",
    "WHOS_ON_FIRST",
    "WIKIDATA",
    "GOOGLE_BOOKS",
    "CONTENT_CHANNELS",
    "MACHINE_TRANSLATION",
  ],
  extract: {
    // The label first, then the aliases: Wikidata's order, kept as the claims' positions.
    WIKIDATA: ({ entity }) =>
      [...entity.labels, ...entity.aliases].flatMap(({ language, value }) =>
        Option.toArray(supportedLanguageOf(language)).flatMap((supported) =>
          Schema.is(Name.fields.name)(value)
            ? [{ language: supported, value: Name.make({ name: value, grammaticalGender: null }) }]
            : [],
        ),
      ),
    GOOGLE_BOOKS: (result) =>
      result.editions.flatMap((edition) =>
        Schema.is(Name.fields.name)(edition.title)
          ? edition.languages.flatMap((tag) =>
              Option.toArray(supportedLanguageOf(tag)).map((language) => ({
                language,
                value: Name.make({ name: edition.title, grammaticalGender: null }),
              })),
            )
          : [],
      ),
    CONTENT_CHANNELS: (item) =>
      Option.toArray(
        Option.flatMap(Option.fromNullishOr(item.language), supportedLanguageOf),
      ).flatMap((language) =>
        Schema.is(Name.fields.name)(item.title)
          ? [{ language, value: Name.make({ name: item.title, grammaticalGender: null }) }]
          : [],
      ),
  },
})
