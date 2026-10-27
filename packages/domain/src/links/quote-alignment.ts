/**
 * Grounds the spans a language model quotes back in the text it read. Models are asked to quote
 * exactly, but may change case, accents, punctuation or a letter here and there, so a quote is
 * matched verbatim first, then word by word ignoring case and accents, then by similar words.
 */
import {
  Array as EffectArray,
  HashSet,
  Number as EffectNumber,
  Option,
  Order,
  String as EffectString,
} from "effect"

import type { AlignmentStatus } from "./domain.js"
import { type Word, words } from "./words.js"

export interface AlignedQuote {
  readonly start: number
  readonly end: number
  readonly status: AlignmentStatus
}

interface Candidate {
  readonly start: number
  readonly end: number
  readonly score: number
}

/** How alike a quote's words must be to the text's, on average, to count as a fuzzy match. */
export const MINIMUM_FUZZY_SIMILARITY = 0.8

const isWordCharacter = (character: string | undefined) =>
  character !== undefined && /[\p{L}\p{N}]/u.test(character)

/** A verbatim match must not start or end inside a word, as "sol" would within "solo". */
const isOnWordBoundaries = ({ text, start, end }: Candidate & { readonly text: string }) =>
  !(isWordCharacter(text[start - 1]) && isWordCharacter(text[start])) &&
  !(isWordCharacter(text[end - 1]) && isWordCharacter(text[end]))

const verbatimMatches = (text: string, quote: string): ReadonlyArray<Candidate> => {
  const matches: Array<Candidate> = []
  let index = text.indexOf(quote)

  // oxlint-disable-next-line effect/imperative-loops -- Walks every occurrence through indexOf.
  while (index >= 0) {
    const match = { start: index, end: index + quote.length, score: 1 }
    if (isOnWordBoundaries({ text, ...match })) matches.push(match)
    index = text.indexOf(quote, index + 1)
  }

  return matches
}

/** Levenshtein distance between two strings, in code points. */
const editDistance = (left: string, right: string): number => {
  const rightCharacters = Array.from(right)

  const nextRow = (previousRow: ReadonlyArray<number>, leftCharacter: string) =>
    rightCharacters.reduce<ReadonlyArray<number>>(
      (row, rightCharacter) => {
        const column = row.length - 1

        return [
          ...row,
          Math.min(
            (previousRow[column + 1] ?? 0) + 1,
            (row[column] ?? 0) + 1,
            (previousRow[column] ?? 0) + (leftCharacter === rightCharacter ? 0 : 1),
          ),
        ]
      },
      [(previousRow[0] ?? 0) + 1],
    )

  const lastRow = Array.from(left).reduce(nextRow, EffectArray.range(0, rightCharacters.length))
  return lastRow[lastRow.length - 1] ?? 0
}

const similarity = (left: string, right: string) =>
  left === right
    ? 1
    : 1 - editDistance(left, right) / Math.max(Array.from(left).length, Array.from(right).length)

/** Every run of the text's words as long as the quote, scored by how alike its words are. */
const wordMatches = (
  textWords: ReadonlyArray<Word>,
  quoteWords: EffectArray.NonEmptyReadonlyArray<Word>,
): ReadonlyArray<Candidate> =>
  EffectArray.range(0, textWords.length - quoteWords.length).flatMap((startIndex) => {
    const window = textWords.slice(startIndex, startIndex + quoteWords.length)
    const first = window[0]
    const last = window[window.length - 1]
    if (first === undefined || last === undefined || window.length < quoteWords.length) return []

    const score =
      EffectNumber.sumAll(
        quoteWords.map((word, index) => similarity(word.value, window[index]?.value ?? "")),
      ) / quoteWords.length

    return [{ start: first.start, end: last.end, score }]
  })

const byScoreThenPosition = Order.combine(
  Order.mapInput(Order.flip(Order.Number), (candidate: Candidate) => candidate.score),
  Order.mapInput(Order.Number, (candidate: Candidate) => candidate.start),
)

/**
 * Locates each quote in `text`, in order. A quote the model repeats takes the next occurrence it
 * hasn't been given yet, so repeated mentions keep their own positions; a quote repeated more often
 * than the text has it falls back to its best match.
 */
export const alignQuotes = (
  text: string,
  quotes: ReadonlyArray<string>,
): ReadonlyArray<Option.Option<AlignedQuote>> => {
  const textWords = words(text)
  const keyOf = (candidate: Candidate) => `${candidate.start}:${candidate.end}`

  const candidatesFor = (
    quote: string,
  ): Option.Option<{
    readonly candidates: EffectArray.NonEmptyReadonlyArray<Candidate>
    readonly status: AlignmentStatus
  }> => {
    const quoteWords = words(quote)
    if (EffectString.isEmpty(quote)) return Option.none()

    const verbatim = verbatimMatches(text, quote)
    if (EffectArray.isReadonlyArrayNonEmpty(verbatim)) {
      return Option.some({ candidates: verbatim, status: "EXACT" })
    }
    if (!EffectArray.isReadonlyArrayNonEmpty(quoteWords)) return Option.none()

    const scored = wordMatches(textWords, quoteWords)
    const normalized = scored.filter((candidate) => candidate.score === 1)
    if (EffectArray.isReadonlyArrayNonEmpty(normalized)) {
      return Option.some({ candidates: normalized, status: "NORMALIZED" })
    }

    const fuzzy = scored.filter((candidate) => candidate.score >= MINIMUM_FUZZY_SIMILARITY)
    return EffectArray.isReadonlyArrayNonEmpty(fuzzy)
      ? Option.some({ candidates: fuzzy, status: "FUZZY" })
      : Option.none()
  }

  return quotes.reduce<{
    readonly claimed: HashSet.HashSet<string>
    readonly aligned: ReadonlyArray<Option.Option<AlignedQuote>>
  }>(
    ({ claimed, aligned }, quote) =>
      Option.match(candidatesFor(quote.trim()), {
        onNone: () => ({ claimed, aligned: [...aligned, Option.none()] }),
        onSome: ({ candidates, status }) => {
          const ranked = EffectArray.sort(candidates, byScoreThenPosition)
          const chosen = Option.getOrElse(
            EffectArray.findFirst(ranked, (candidate) => !HashSet.has(claimed, keyOf(candidate))),
            () => EffectArray.headNonEmpty(ranked),
          )
          return {
            claimed: HashSet.add(claimed, keyOf(chosen)),
            aligned: [...aligned, Option.some({ start: chosen.start, end: chosen.end, status })],
          }
        },
      }),
    { claimed: HashSet.empty(), aligned: [] },
  ).aligned
}
