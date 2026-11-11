import { Option, Result, Schema } from "effect"

import { GrammaticalGender } from "../../common/enums.js"
import { toSearchableText } from "../../common/utils/strings.js"
import { everyKind } from "../kinds.js"
import { defineProperty } from "../property.js"
import { Syntropedia } from "../providers/syntropedia.js"
import { Tmdb } from "../providers/tmdb.js"
import { WhosOnFirst } from "../providers/whos-on-first.js"
import { Wikidata, WikidataProperty } from "../providers/wikidata.js"
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
 * The gazetteer's names, Wikidata's labels and aliases, Syntropedia's names, TMDB's titles, Google Books' edition titles and channels' item titles are each
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
  sources: (source) => [
    source.person(),
    source.whosOnFirst({
      extract: (place) =>
        WhosOnFirst.names(place).flatMap(({ language, value }) =>
          Schema.is(FoldedName)(value)
            ? [
                source.found({
                  language,
                  value: Name.make({ name: value, grammaticalGender: null }),
                }),
              ]
            : [],
        ),
    }),
    source.wikidata({
      /**
       * The label, then the aliases, then taxon common names (P1843): Wikidata's order, kept as
       * the claims' positions. Taxa are often labelled with their scientific name (tomato's
       * Spanish label is "Solanum lycopersicum"), which isn't a name: those are left out.
       */
      extract: (entity) => {
        const scientificNames = Wikidata.statements(entity, WikidataProperty.TAXON_NAME).flatMap(
          (statement) =>
            Result.match(Wikidata.string(statement, FoldedName), {
              onSuccess: (name) => [toSearchableText(name)],
              onFailure: () => [],
            }),
        )

        const isScientificName = (name: string) => scientificNames.includes(toSearchableText(name))

        return [
          ...Wikidata.terms(entity).flatMap(({ language, value }) =>
            Schema.is(FoldedName)(value) && !isScientificName(value)
              ? [
                  source.found({
                    language,
                    value: Name.make({ name: value, grammaticalGender: null }),
                  }),
                ]
              : [],
          ),
          ...Wikidata.statements(entity, WikidataProperty.TAXON_COMMON_NAME).map((statement) =>
            Result.flatMap(Wikidata.monolingualText(statement, FoldedName), ({ language, value }) =>
              source.found({
                language,
                value: Name.make({ name: value, grammaticalGender: null }),
              }),
            ),
          ),
        ]
      },
    }),
    source.syntropedia({
      extract: (plant) =>
        Syntropedia.names(plant).flatMap(({ language, value }) =>
          Schema.is(FoldedName)(value)
            ? [
                source.found({
                  language,
                  value: Name.make({ name: value, grammaticalGender: null }),
                }),
              ]
            : [],
        ),
    }),
    source.tmdb({
      extract: (work) =>
        Tmdb.titles(work).flatMap(({ language, value }) =>
          Schema.is(FoldedName)(value)
            ? [
                source.found({
                  language,
                  value: Name.make({ name: value, grammaticalGender: null }),
                }),
              ]
            : [],
        ),
    }),
    source.googleBooks({
      extract: (result) =>
        result.editions.flatMap((edition) =>
          Schema.is(FoldedName)(edition.title)
            ? edition.languages.flatMap((tag) =>
                Option.toArray(supportedLanguageOf(tag)).map((language) =>
                  source.found({
                    language,
                    value: Name.make({ name: edition.title, grammaticalGender: null }),
                  }),
                ),
              )
            : [],
        ),
    }),
    source.contentChannels({
      extract: (item) =>
        Option.toArray(
          Option.flatMap(Option.fromNullishOr(item.language), supportedLanguageOf),
        ).flatMap((language) =>
          Schema.is(FoldedName)(item.title)
            ? [
                source.found({
                  language,
                  value: Name.make({ name: item.title, grammaticalGender: null }),
                }),
              ]
            : [],
        ),
    }),
    source.machineTranslation(),
  ],
  schemaOrg: {
    match: "EXACT",
    encode: ({ name }, { index }) => (index === 0 ? { name } : { alternateName: name }),
  },
})
