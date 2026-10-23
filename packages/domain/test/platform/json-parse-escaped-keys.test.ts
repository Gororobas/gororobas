/**
 * Canary for a V8 bug in Node v24.19.0 (V8 13.6.233.17): after a few dozen parses, `JSON.parse`
 * returns single-character escaped object keys such as `"\n"`, `"\t"` or `"\u0000"` as `"\\"`.
 * The same text evaluated as a JavaScript literal, or parsed in a fresh process, is correct.
 *
 * Rich-text attributes accept arbitrary keys, so schema round-trip properties used to fail
 * intermittently. Property tests skip these keys through `avoidsJsonParseKeyCorruption`.
 * When this test starts failing, Node has fixed the bug: delete it and that workaround.
 */
import { expect, it } from "@effect/vitest"
import { Record, Schema } from "effect"

const KEYS = [
  "\t",
  "\n",
  "\u0000",
  "\ud800",
  "\udc00",
  "\\",
  "a",
  "b",
  "😀",
  '"q',
  "/x",
  "k1",
  "k2",
]

const makeRandom = (seed: number) => () => {
  seed = (seed * 1103515245 + 12345) % 2147483648
  return seed / 2147483648
}

const generate = (random: () => number, depth: number): Schema.Json => {
  const roll = random()
  const pick = <A>(values: ReadonlyArray<A>) => values[Math.floor(random() * values.length)]
  if (depth > 3 || roll < 0.3) return pick<Schema.Json>([null, true, false, 0, "x", "\ud800", []])
  if (roll < 0.5) {
    return Array.from({ length: Math.floor(random() * 3) }, () => generate(random, depth + 1))
  }
  const entries = Array.from(
    { length: Math.floor(random() * 6) },
    () => [pick(KEYS), generate(random, depth + 1)] as const,
  )
  return Record.fromEntries(entries)
}

it.fails("JSON.parse round-trips single-character escaped keys (fails on affected Node versions)", () => {
  const random = makeRandom(1)
  const corrupted = Array.from({ length: 2_000 }, () => JSON.stringify(generate(random, 0))).filter(
    // oxlint-disable-next-line effect/avoid-direct-json -- The canary exercises the runtime's JSON parser itself.
    (text) => JSON.stringify(JSON.parse(text)) !== text,
  )
  expect(corrupted).toEqual([])
})
