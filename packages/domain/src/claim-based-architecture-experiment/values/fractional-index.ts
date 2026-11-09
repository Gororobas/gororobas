/**
 * Keys that order a list and always fit another key between two: inserting or moving one value
 * never renumbers the rest, so a person's reorder supersedes only the claims they moved. They
 * compare as plain strings, in JavaScript and in SQLite's default collation alike.
 *
 * The algorithm is the one the `fractional-indexing` package implements, over base-62 digits.
 */
import { Array as EffectArray, Option, Schema } from "effect"

const digits = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz"

/** Never empty and never ending in "0", so no two keys mean the same position. */
export const FractionalIndex = Schema.String.check(
  Schema.isPattern(/^[0-9A-Za-z]*[1-9A-Za-z]$/),
).pipe(Schema.brand("FractionalIndex"))

export type FractionalIndex = typeof FractionalIndex.Type

const digitOf = (key: string, index: number) =>
  index < key.length ? digits.indexOf(key.charAt(index)) : 0

/** How many leading digits `low` (padded with zeros) shares with `high`. */
const sharedPrefix = (low: string, high: string): number => {
  const differing = EffectArray.makeBy(high.length, (index) => index).findIndex(
    (index) => digitOf(low, index) !== digitOf(high, index),
  )
  return differing === -1 ? high.length : differing
}

/** Digits strictly between `low` ("" for the start) and `high` (null for the end). */
const midpoint = (low: string, high: string | null): string => {
  if (high !== null) {
    const shared = sharedPrefix(low, high)
    if (shared > 0) {
      return high.slice(0, shared) + midpoint(low.slice(shared), high.slice(shared))
    }
  }

  const lowDigit = digitOf(low, 0)
  const highDigit = high === null ? digits.length : digitOf(high, 0)

  if (highDigit - lowDigit > 1) return digits.charAt(Math.round((lowDigit + highDigit) / 2))
  if (high !== null && high.length > 1) return high.slice(0, 1)

  return digits.charAt(lowDigit) + midpoint(low.slice(1), null)
}

/** A key after `low` and before `high`; `None` for either end. `low` must sort before `high`. */
export const keyBetween = (
  low: Option.Option<FractionalIndex>,
  high: Option.Option<FractionalIndex>,
): FractionalIndex =>
  FractionalIndex.make(
    midpoint(
      Option.getOrElse(low, () => ""),
      Option.getOrNull(high),
    ),
  )
