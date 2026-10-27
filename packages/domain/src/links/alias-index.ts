/**
 * Candidate generation: every name a wiki article goes by (common names in every language,
 * scientific names, a person's names, route handles), normalized so "Feijões" finds "feijão"'s
 * neighbours and "MANDIOCA" finds "mandioca".
 */
import { Array as EffectArray, Option, Record } from "effect"

import type { WikiArticleId } from "../common/ids.js"
import type { WikiArticleKind } from "../wiki/wiki-article.js"
import { type Word, words } from "./words.js"

export interface WikiArticleAlias {
  readonly wikiArticleId: WikiArticleId
  readonly kind: WikiArticleKind
  readonly alias: string
}

export interface WikiArticleCandidate {
  readonly wikiArticleId: WikiArticleId
  readonly kind: WikiArticleKind
  readonly names: ReadonlyArray<string>
}

/** An alias found in a text, at original (not normalized) offsets. */
export interface AliasOccurrence {
  readonly start: number
  readonly end: number
  readonly candidates: EffectArray.NonEmptyReadonlyArray<WikiArticleCandidate>
}

/** Shorter aliases ("pé", "ar") match too many ordinary words to be worth linking. */
const MINIMUM_ALIAS_LENGTH = 3
/** Longer names are rare and only make scanning slower. */
const MAXIMUM_ALIAS_WORDS = 6

const keyOf = (tokens: ReadonlyArray<Word>) => tokens.map((token) => token.value).join(" ")

/**
 * Plural forms in Portuguese, Spanish and English mostly add "s" or "es" to the singular; Portuguese
 * also turns "-ão" into "-ões" or "-ães" and "-al" into "-ais". Accents are already folded.
 */
const singularKeys = (key: string) => [
  key,
  ...(key.endsWith("oes") || key.endsWith("aes") ? [`${key.slice(0, -3)}ao`] : []),
  ...(key.endsWith("ais") ? [`${key.slice(0, -3)}al`] : []),
  ...(key.endsWith("es") ? [key.slice(0, -2)] : []),
  ...(key.endsWith("s") ? [key.slice(0, -1)] : []),
]

export const makeAliasIndex = (aliases: ReadonlyArray<WikiArticleAlias>) => {
  const indexed = aliases.flatMap((alias) => {
    const tokens = words(alias.alias)
    const key = keyOf(tokens)
    return key.length < MINIMUM_ALIAS_LENGTH || tokens.length > MAXIMUM_ALIAS_WORDS
      ? []
      : [{ ...alias, key }]
  })

  const candidatesById = Record.map(
    EffectArray.groupBy(indexed, (alias) => alias.wikiArticleId),
    (group): WikiArticleCandidate => ({
      wikiArticleId: group[0].wikiArticleId,
      kind: group[0].kind,
      names: EffectArray.dedupe(group.map((alias) => alias.alias)),
    }),
  )

  const candidatesByKey = Record.map(
    EffectArray.groupBy(indexed, (alias) => alias.key),
    (group): ReadonlyArray<WikiArticleCandidate> =>
      EffectArray.dedupe(group.map((alias) => alias.wikiArticleId)).flatMap((wikiArticleId) =>
        Option.toArray(Record.get(candidatesById, wikiArticleId)),
      ),
  )

  const lookupKey = (key: string): ReadonlyArray<WikiArticleCandidate> =>
    EffectArray.findFirst(singularKeys(key), (candidate) =>
      Record.has(candidatesByKey, candidate),
    ).pipe(
      Option.flatMap((found) => Record.get(candidatesByKey, found)),
      Option.getOrElse(() => []),
    )

  return {
    /** Articles going by exactly this name. */
    lookup: (name: string) => lookupKey(keyOf(words(name))),

    /** Every alias in the text, preferring the longest at each position. */
    scan: (text: string): ReadonlyArray<AliasOccurrence> => {
      const tokens = words(text)

      const longestAt = (index: number) =>
        EffectArray.findFirst(
          EffectArray.reverse(
            EffectArray.range(1, Math.min(MAXIMUM_ALIAS_WORDS, tokens.length - index)),
          ),
          (length) => {
            const first = tokens[index]
            const last = tokens[index + length - 1]
            const candidates = lookupKey(keyOf(tokens.slice(index, index + length)))

            return first !== undefined &&
              last !== undefined &&
              EffectArray.isReadonlyArrayNonEmpty(candidates)
              ? Option.some({ length, start: first.start, end: last.end, candidates })
              : Option.none()
          },
        )

      const occurrences: Array<AliasOccurrence> = []
      let index = 0

      // oxlint-disable-next-line effect/imperative-loops -- Matches consume a variable number of tokens.
      while (index < tokens.length) {
        const match = longestAt(index)

        if (Option.isSome(match)) {
          const { length, ...occurrence } = match.value
          occurrences.push(occurrence)
          index += length
        } else {
          index += 1
        }
      }

      return occurrences
    },
  }
}

export type AliasIndex = ReturnType<typeof makeAliasIndex>
