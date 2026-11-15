import { Array as EffectArray, Option, Record, Schema } from "effect"

import type { SupportedLanguage } from "../../common/enums.js"
import { everyKind } from "../kinds.js"
import { defineCanonicalProperty } from "../property.js"
import { Tmdb } from "../providers/tmdb.js"
import { WhosOnFirst } from "../providers/whos-on-first.js"
import { NameWithNormalizedEquivalence } from "../values/name-with-normalized-equivalence.js"
import { supportedLanguageOf } from "../values/supported-language.js"
import { Name } from "./names.js"

/** A provider's names in each language, keeping only the first: the one it puts forward. */
const firstPerLanguage = (
  names: ReadonlyArray<{ readonly language: SupportedLanguage; readonly value: string }>,
): ReadonlyArray<{ readonly language: SupportedLanguage; readonly value: Name }> =>
  EffectArray.dedupeWith(names, (self, that) => self.language === that.language).flatMap(
    ({ language, value }) =>
      Schema.is(NameWithNormalizedEquivalence)(value)
        ? [{ language, value: Name.make({ name: value, grammaticalGender: null }) }]
        : [],
  )

/**
 * The name an article goes by in a language, where nothing better is known about the reader: its
 * heading, and what its handle is derived from once, when the article is created (renaming never
 * changes the handle, so links keep working). Not "the" name: names are situated (`names`), and
 * a reader's region may make another one the more familiar. It isn't required to be among them.
 *
 * Required, so a new article needs only a kind, this, its handle and, optionally, its identifiers
 * in external providers.
 */
export const MostCommonlyKnownAsProperty = defineCanonicalProperty({
  id: "mostCommonlyKnownAs",
  valueSchema: Name,
  kinds: everyKind,
  scope: "LANGUAGE_SPECIFIC",
  cardinality: "ONE",
  presence: "REQUIRED",
  sources: (source) => [
    source.person(),
    source.whosOnFirst({
      extract: (place) => firstPerLanguage(WhosOnFirst.names(place)).map(source.found),
    }),
    source.tmdb({ extract: (work) => firstPerLanguage(Tmdb.titles(work)).map(source.found) }),
    source.wikidata({
      extract: (entity) =>
        firstPerLanguage(
          Record.values(entity.labels).flatMap(({ language, value }) =>
            Option.toArray(supportedLanguageOf(language)).map((supported) => ({
              language: supported,
              value,
            })),
          ),
        ).map(source.found),
    }),
  ],
  schemaOrg: { match: "EXACT", encode: ({ name }) => ({ name }) },
})
