import { Array as EffectArray, Number as EffectNumber, Option, Schema } from "effect"

import { GoogleBooksVolumeId } from "./external-identifiers.js"

/** The ISBN without separators, as Google Books lists industry identifiers ("978-85-…" is "97885…"). */
export const isbnDigits = (isbn: string): string => isbn.replaceAll(/[\s-]/g, "").toUpperCase()

const ISBN_13_WEIGHTS = [1, 3, 1, 3, 1, 3, 1, 3, 1, 3, 1, 3, 1]
const ISBN_10_WEIGHTS = [10, 9, 8, 7, 6, 5, 4, 3, 2, 1]

/** The sum of each digit times its weight, as ISBN check digits are defined. */
const weightedSum = (digits: string, weights: ReadonlyArray<number>) =>
  EffectNumber.sumAll(
    EffectArray.zipWith(digits.split(""), weights, (digit, weight) =>
      digit === "X" ? 10 * weight : Number(digit) * weight,
    ),
  )

export const isValidIsbn = (isbn: string): boolean => {
  const digits = isbnDigits(isbn)
  if (/^97[89][0-9]{10}$/.test(digits)) return weightedSum(digits, ISBN_13_WEIGHTS) % 10 === 0
  if (/^[0-9]{9}[0-9X]$/.test(digits)) return weightedSum(digits, ISBN_10_WEIGHTS) % 11 === 0
  return false
}

/** Valid ISBNs written in a URL, as bookstores do in their product paths ("/livro/9788535933697/…"). */
export const isbnsInUrl = (url: string): ReadonlyArray<string> =>
  EffectArray.dedupe(
    [...url.matchAll(/(?<![0-9])(97[89][0-9]{10}|[0-9]{9}[0-9Xx])(?![0-9])/g)].flatMap((match) =>
      match[1] !== undefined && isValidIsbn(match[1]) ? [isbnDigits(match[1])] : [],
    ),
  )

/** The volume ID of a Google Books page ("books.google.com.br/books/about/…?id=…"). */
export const googleBooksVolumeIdInUrl = (url: string): Option.Option<GoogleBooksVolumeId> =>
  Option.flatMap(Option.liftThrowable(() => new URL(url))(), (parsed) =>
    /(^|\.)books\.google\.[a-z.]+$/.test(parsed.hostname)
      ? Option.filter(
          Option.fromNullishOr(parsed.searchParams.get("id")),
          Schema.is(GoogleBooksVolumeId),
        )
      : Option.none(),
  )
