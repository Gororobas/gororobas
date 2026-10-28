/**
 * Queries for Turso's full-text search indexes, defined at the end of `schema.sql`.
 *
 * They index the `searchable_*` columns, which hold `toSearchableText` folds: Turso's tokenizers
 * don't fold accents, so "feijao" only finds "feijão" through them. Indexes split text into
 * trigrams, so a search matches partial words while someone is still typing ("tomat" finds
 * "tomate"), and BM25 ranks names above passing mentions in content.
 */
import { toSearchableText } from "@gororobas/domain"
import { Array as EffectArray, Option, Order } from "effect"
import type { SqlClient, Statement } from "effect/sql"

/** Trigram indexes can't match shorter terms. */
const MINIMUM_TERM_LENGTH = 3
const MAXIMUM_TERMS = 12

/** The folded terms of a search, each of which a result must contain. */
export const fullTextQueryTerms = (text: string): ReadonlyArray<string> =>
  toSearchableText(text)
    .split(" ")
    .filter((term) => term.length >= MINIMUM_TERM_LENGTH && /^[\p{L}\p{N}]+$/u.test(term))
    .slice(0, MAXIMUM_TERMS)

/**
 * Compiles text into a query every term of must match, or None when no term can match.
 *
 * Turso 0.8.3 returns zero scores for bound FTS queries, so the query is inlined as a literal.
 * That's safe because terms only hold letters and digits, which `fullTextQueryTerms` enforces.
 */
export const fullTextQuery = (
  sql: SqlClient.SqlClient,
  text: string,
): Option.Option<Statement.Fragment> => {
  const terms = fullTextQueryTerms(text)

  return EffectArray.isReadonlyArrayNonEmpty(terms)
    ? Option.some(sql.literal(`'${terms.map((term) => `+${term}`).join(" ")}'`))
    : Option.none()
}

/**
 * Whether `searchable` really holds every term. Trigram indexes match rows holding all of a
 * term's trigrams anywhere: a long text with "ban", "ana", "nan", "ann" and "nna" scattered
 * through it matches "bananna". Checking hits restores substring matching.
 */
export const containsEveryTerm = (
  sql: SqlClient.SqlClient,
  input: { searchable: Statement.Fragment; text: string },
): Statement.Fragment =>
  sql.and(
    fullTextQueryTerms(input.text).map((term) => sql`instr(${input.searchable}, ${term}) > 0`),
  )

// TYPO TOLERANCE

/** How many rows sharing trigrams with a misspelled search are compared with it. */
export const SIMILARITY_CANDIDATES = 200

/** A typo needs a word long enough to still be recognizable around it. */
const MINIMUM_TYPO_TERM_LENGTH = 4

const trigrams = (term: string): ReadonlyArray<string> =>
  EffectArray.makeBy(Math.max(term.length - 2, 0), (start) => term.slice(start, start + 3))

/** The term with each pair of neighbors swapped, one pair at a time. */
const swaps = (term: string): ReadonlyArray<string> =>
  EffectArray.makeBy(
    Math.max(term.length - 1, 0),
    (index) =>
      `${term.slice(0, index)}${term.charAt(index + 1)}${term.charAt(index)}${term.slice(index + 2)}`,
  )

/**
 * Compiles text into a query any of its terms' trigrams match, ranking rows that share more of
 * them first, or None when no term is long enough to hold a typo. "tomte" shares "tom" with
 * "tomate". A swap can break every trigram of a short word ("mraia" shares none with "maria"),
 * so the trigrams of each swapped variant count too. Inlined as a literal for the reason
 * `fullTextQuery` is.
 */
export const similarityQuery = (
  sql: SqlClient.SqlClient,
  text: string,
): Option.Option<Statement.Fragment> => {
  const terms = fullTextQueryTerms(text)
  if (!terms.some((term) => term.length >= MINIMUM_TYPO_TERM_LENGTH)) return Option.none()

  const grams = EffectArray.dedupe(
    terms.flatMap((term) => [term, ...swaps(term)]).flatMap(trigrams),
  )
  return Option.some(sql.literal(`'${grams.join(" ")}'`))
}

interface DistanceRows {
  readonly previous: ReadonlyArray<number>
  readonly current: ReadonlyArray<number>
}

/** Optimal string alignment distance: edits, counting a swap of neighbors as one. */
export const editDistance = (from: string, to: string): number => {
  const fromCharacters = Array.from(from)
  const toCharacters = Array.from(to)

  // Each row holds the distances from a prefix of `from` to every prefix of `to`.
  // Swaps look two rows back, so the fold keeps the previous row too.
  const firstRows: DistanceRows = {
    previous: [],
    current: EffectArray.makeBy(toCharacters.length + 1, (column) => column),
  }

  const { current } = EffectArray.reduce(
    EffectArray.makeBy(fromCharacters.length, (rowIndex) => rowIndex),
    firstRows,
    ({ previous, current }, rowIndex): DistanceRows => ({
      previous: current,
      current: EffectArray.reduce(
        EffectArray.makeBy(toCharacters.length, (columnIndex) => columnIndex),
        [rowIndex + 1],
        (cells: ReadonlyArray<number>, columnIndex) => {
          const character = fromCharacters[rowIndex]
          const toCharacter = toCharacters[columnIndex]
          const column = columnIndex + 1

          const swapped =
            rowIndex > 0 &&
            columnIndex > 0 &&
            character === toCharacters[columnIndex - 1] &&
            fromCharacters[rowIndex - 1] === toCharacter

          return [
            ...cells,
            Math.min(
              (current[column] ?? Number.POSITIVE_INFINITY) + 1,
              (cells[column - 1] ?? Number.POSITIVE_INFINITY) + 1,
              (current[column - 1] ?? Number.POSITIVE_INFINITY) +
                (character === toCharacter ? 0 : 1),
              swapped
                ? (previous[column - 2] ?? Number.POSITIVE_INFINITY) + 1
                : Number.POSITIVE_INFINITY,
            ),
          ]
        },
      ),
    }),
  )

  return current[toCharacters.length] ?? Number.POSITIVE_INFINITY
}

const allowedEdits = (term: string) =>
  term.length < MINIMUM_TYPO_TERM_LENGTH ? 0 : term.length < 8 ? 1 : 2

/** The fewest edits that turn `term` into `word`, or into its start while someone is typing. */
const edits = (term: string, word: string) =>
  Math.min(
    editDistance(term, word),
    word.length > term.length
      ? editDistance(term, word.slice(0, term.length))
      : Number.POSITIVE_INFINITY,
  )

interface ScoredCandidate<A> {
  readonly candidate: A
  readonly index: number
  readonly totalEdits: number
  /** Whether the title, rather than other names, holds the words that matched. */
  readonly matchesInTitle: boolean
  readonly titleEdits: number
}

/**
 * The candidates whose words come within a few edits of every term, closest first. Among equally
 * close candidates, those whose `title` holds the matching words come first, then those whose
 * whole title is closest to the text: "fiejao" is one edit from "Feijão", "Feijão Jalo" and
 * Soja's alias "feijão-soja", but means the first. Then candidate order.
 * `words` and `title` are already folded with `toSearchableText`.
 */
export const rankBySimilarity = <A>(input: {
  text: string
  candidates: ReadonlyArray<A>
  words: (candidate: A) => string
  title?: (candidate: A) => string
}): ReadonlyArray<A> => {
  const terms = fullTextQueryTerms(input.text)
  const folded = terms.join(" ")

  const fewestEdits = (term: string, text: string) =>
    Math.min(...text.split(" ").map((word) => edits(term, word)))

  const scored = input.candidates.flatMap((candidate, index): ReadonlyArray<ScoredCandidate<A>> => {
    const termEdits = terms.map((term) => ({
      term,
      count: fewestEdits(term, input.words(candidate)),
    }))
    if (!termEdits.every(({ term, count }) => count <= allowedEdits(term))) return []

    const title = input.title?.(candidate)

    return [
      {
        candidate,
        index,
        totalEdits: termEdits.reduce((sum, { count }) => sum + count, 0),
        matchesInTitle:
          title !== undefined &&
          termEdits.every(({ term, count }) => fewestEdits(term, title) === count),
        titleEdits: title === undefined ? 0 : editDistance(folded, title),
      },
    ]
  })

  return EffectArray.sort(
    scored,
    Order.combineAll([
      Order.mapInput(
        Order.Number,
        (scoredCandidate: ScoredCandidate<A>) => scoredCandidate.totalEdits,
      ),
      Order.mapInput(
        Order.flip(Order.Boolean),
        (scoredCandidate: ScoredCandidate<A>) => scoredCandidate.matchesInTitle,
      ),
      Order.mapInput(
        Order.Number,
        (scoredCandidate: ScoredCandidate<A>) => scoredCandidate.titleEdits,
      ),
      Order.mapInput(Order.Number, (scoredCandidate: ScoredCandidate<A>) => scoredCandidate.index),
    ]),
  ).map(({ candidate }) => candidate)
}
