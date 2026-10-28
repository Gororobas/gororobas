import { Effect, Crypto as EffectCrypto, String as EffectString, Predicate } from "effect"
import { Hex } from "effect/encoding"

import { words } from "../../links/words.js"

/**
 * Limits a string to a certain length for UI or SEO purposes.
 *
 * Dive further: https://hdoro.dev/javascript-truncation
 */
export function truncate(str: string, maxLength: number) {
  if (str.length < maxLength) {
    return str
  }

  if (maxLength < 0) return ""

  // To prevent truncating in the middle of words, let's get
  // the position of the first whitespace after the truncation
  const firstWhitespaceAfterTruncation = str.slice(maxLength).search(/\s/) + maxLength

  return `${str.slice(0, firstWhitespaceAfterTruncation)}...`
}

export function capitalize(str: string, allWords = true): string {
  if (!Predicate.isString(str) || EffectString.isEmpty(str)) {
    return str
  }

  if (allWords) {
    return str
      .split(" ")
      .map((word) => capitalize(word, false))
      .join(" ")
  }

  return `${str.charAt(0).toUpperCase()}${str.slice(1) || ""}`
}

/**
 * Case- and accent-folded words joined by spaces, so "Feijão-Preto" is stored and searched as "feijao preto".
 * Full-text search indexes these columns: the database doesn't fold accents itself.
 */
export const toSearchableText = (text: string): string =>
  words(text)
    .map((word) => word.value)
    .join(" ")

export const hashString = (str: string) =>
  EffectCrypto.Crypto.use((crypto) => crypto.digest("SHA-256", new TextEncoder().encode(str))).pipe(
    Effect.map((digest) => Hex.encode(digest).slice(0, 16)),
  )
