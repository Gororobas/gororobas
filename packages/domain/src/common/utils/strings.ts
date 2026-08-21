/* oxlint-disable effect/casting-awareness -- normalization establishes the Handle invariant. */
import { String as EffectString, Predicate } from "effect"

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

  return `${str[0].toUpperCase()}${str.slice(1) || ""}`
}
