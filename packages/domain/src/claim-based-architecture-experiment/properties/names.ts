import { Option, Result, Schema } from "effect"

import { GrammaticalGender } from "../../common/enums.js"
import { toSearchableText } from "../../common/utils/strings.js"
import { everyKind } from "../kinds.js"
import { defineSituatedProperty } from "../property.js"
import { Syntropedia } from "../providers/syntropedia.js"
import { Tmdb } from "../providers/tmdb.js"
import { WhosOnFirst } from "../providers/whos-on-first.js"
import { Wikidata, WikidataProperty } from "../providers/wikidata.js"
import { NameWithNormalizedEquivalence } from "../values/name-with-normalized-equivalence.js"
import { supportedLanguageOf } from "../values/supported-language.js"

/**
 * One of an article's names. A different grammatical gender is a
 * different value, so correcting it is a change.
 */
export const Name = Schema.Struct({
  name: NameWithNormalizedEquivalence,
  grammaticalGender: Schema.NullOr(GrammaticalGender),
})

export type Name = typeof Name.Type

/**
 * What people call the article, per language. Situated: names change from
 * one region to the next ("na Colômbia chamamos de guamo"), so each claim carries where it holds,
 * and the summary orders names by how many people use them. The name the article goes by is
 * `mostCommonlyKnownAs`, canonical, and not necessarily among these.
 *
 * The gazetteer's names, Wikidata's labels and aliases, Syntropedia's names, TMDB's titles,
 * Google Books' edition titles and channels' item titles are each their source's claims, so an
 * article is named in every language they know. Scientific names aren't names: they name a taxon,
 * belong to no language, and come from GBIF's `taxonomicClassification`.
 */
export const NamesProperty = defineSituatedProperty({
  id: "names",
  valueSchema: Name,
  kinds: everyKind,
  scope: "LANGUAGE_SPECIFIC",
  sources: (source) => ({
    person: source.person({ inferable: true }),
    whosOnFirst: source.whosOnFirst({
      extract: (place) =>
        WhosOnFirst.names(place).flatMap(({ language, value }) =>
          Schema.is(NameWithNormalizedEquivalence)(value)
            ? [
                source.found({
                  language,
                  value: Name.make({ name: value, grammaticalGender: null }),
                }),
              ]
            : [],
        ),
    }),
    wikidata: source.wikidata({
      /**
       * The label, the aliases and taxon common names (P1843). Taxa are often labelled with their scientific name (tomato's
       * Spanish label is "Solanum lycopersicum"), which isn't a name: those are left out.
       */
      extract: (entity) => {
        const scientificNames = Wikidata.statements(entity, WikidataProperty.TAXON_NAME).flatMap(
          (statement) =>
            Result.match(Wikidata.string(statement, NameWithNormalizedEquivalence), {
              onSuccess: (name) => [toSearchableText(name)],
              onFailure: () => [],
            }),
        )

        const isScientificName = (name: string) => scientificNames.includes(toSearchableText(name))

        return [
          ...Wikidata.terms(entity).flatMap(({ language, value }) =>
            Schema.is(NameWithNormalizedEquivalence)(value) && !isScientificName(value)
              ? [
                  source.found({
                    language,
                    value: Name.make({ name: value, grammaticalGender: null }),
                  }),
                ]
              : [],
          ),
          ...Wikidata.statements(entity, WikidataProperty.TAXON_COMMON_NAME).map((statement) =>
            Result.flatMap(
              Wikidata.monolingualText(statement, NameWithNormalizedEquivalence),
              ({ language, value }) =>
                source.found({
                  language,
                  value: Name.make({ name: value, grammaticalGender: null }),
                }),
            ),
          ),
        ]
      },
    }),
    syntropedia: source.syntropedia({
      extract: (plant) =>
        Syntropedia.names(plant).flatMap(({ language, value }) =>
          Schema.is(NameWithNormalizedEquivalence)(value)
            ? [
                source.found({
                  language,
                  value: Name.make({ name: value, grammaticalGender: null }),
                }),
              ]
            : [],
        ),
    }),
    tmdb: source.tmdb({
      extract: (work) =>
        Tmdb.titles(work).flatMap(({ language, value }) =>
          Schema.is(NameWithNormalizedEquivalence)(value)
            ? [
                source.found({
                  language,
                  value: Name.make({ name: value, grammaticalGender: null }),
                }),
              ]
            : [],
        ),
    }),
    googleBooks: source.googleBooks({
      extract: (result) =>
        result.editions.flatMap((edition) =>
          Schema.is(NameWithNormalizedEquivalence)(edition.title)
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
    contentChannels: source.contentChannels({
      extract: (item) =>
        Option.toArray(
          Option.flatMap(Option.fromNullishOr(item.language), supportedLanguageOf),
        ).flatMap((language) =>
          Schema.is(NameWithNormalizedEquivalence)(item.title)
            ? [
                source.found({
                  language,
                  value: Name.make({ name: item.title, grammaticalGender: null }),
                }),
              ]
            : [],
        ),
    }),
  }),
  summary: (summarize) => summarize.wholeValues(),
  schemaOrg: {
    // `mostCommonlyKnownAs` publishes `name`.
    match: "EXACT",
    encode: ({ name }) => ({ alternateName: name }),
  },
})
