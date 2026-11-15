import { describe, expect, it } from "@effect/vitest"
import { Order, Schema } from "effect"
import * as Arbitrary from "effect/Arbitrary"

import {
  PartialDate,
  PartialDateOrder,
  isPartialDateNotAfter,
} from "../../src/common/utils/dates.js"
import { assertProperty } from "../../src/testing.js"

const decode = Schema.decodeSync(PartialDate)
const encode = Schema.encodeSync(PartialDate)

describe("PartialDate", () => {
  it("decodes and encodes all four precision levels", () => {
    const examples: ReadonlyArray<readonly [string, PartialDate]> = [
      ["2025[Europe/London]", { precision: "year", year: 2025, timezone: "Europe/London" }],
      [
        "2025-11[Europe/London]",
        { precision: "month", year: 2025, month: 11, timezone: "Europe/London" },
      ],
      [
        "2025-11-12[Europe/London]",
        { precision: "day", year: 2025, month: 11, day: 12, timezone: "Europe/London" },
      ],
      [
        "2025-11-12T11:00[Europe/London]",
        {
          precision: "time",
          year: 2025,
          month: 11,
          day: 12,
          hour: 11,
          minute: 0,
          timezone: "Europe/London",
        },
      ],
    ]

    examples.forEach(([encoded, parsed]) => {
      expect(decode(encoded)).toEqual(parsed)
      expect(encode(parsed)).toBe(encoded)
    })
  })

  it("preserves generated objects through string round-trips", () => {
    assertProperty({
      arbitrary: Arbitrary.schema(PartialDate),
      predicate: (date) => {
        expect(decode(encode(date))).toEqual(date)
        return true
      },
    })
  })

  it("supports leap years, four-digit years and IANA timezone aliases", () => {
    const valid = [
      "0000-02-29[UTC]",
      "0004-02-29[UTC]",
      "0099-01-01[UTC]",
      "2000-02-29[UTC]",
      "2024-02-29[Europe/London]",
      "2025-01-01T00:00[Etc/GMT+5]",
      "9999-12-31T23:59[Asia/Kathmandu]",
      "2025[US/Eastern]",
    ]

    valid.forEach((value) => expect(encode(decode(value))).toBe(value))
  })

  it("rejects malformed strings, invalid calendar fields and invalid timezones", () => {
    const invalid = [
      "2025",
      "2025[]",
      "2025[Unknown/Zone]",
      "2025[+02]",
      "2025[+0200]",
      "2025-11-12T11:00Z",
      "2025-11-12T11:00+02:00",
      "2025-11-12T11:00[Europe/London",
      "2025-11-12T11:00:00[Europe/London]",
      "2025-11-12T11[Europe/London]",
      "2025-11-12T[Europe/London]",
      "2025-11T11:00[Europe/London]",
      "2025T11:00[Europe/London]",
      "2025-1[UTC]",
      "2025-00[UTC]",
      "2025-13[UTC]",
      "2025-01-00[UTC]",
      "2025-04-31[UTC]",
      "1900-02-29[UTC]",
      "2025-02-29[UTC]",
      "2025-01-01T24:00[UTC]",
      "2025-01-01T00:60[UTC]",
      "2025[UTC]\n",
      " 2025[UTC]",
      "10000[UTC]",
    ]

    invalid.forEach((value) => expect(() => decode(value)).toThrow(/must|Expected/))
  })

  it("validates decoded objects before encoding", () => {
    const invalid = [
      { precision: "year", year: -1, timezone: "UTC" },
      { precision: "year", year: 10000, timezone: "UTC" },
      { precision: "year", year: 2025.5, timezone: "UTC" },
      { precision: "year", year: 2025, timezone: "Unknown/Zone" },
      { precision: "month", year: 2025, timezone: "UTC" },
      { precision: "day", year: 2025, month: 2, day: 29, timezone: "UTC" },
      { precision: "time", year: 2025, month: 1, day: 1, hour: 24, minute: 0, timezone: "UTC" },
      { precision: "time", year: 2025, month: 1, day: 1, hour: 0, timezone: "UTC" },
    ]

    invalid.forEach((value) =>
      expect(() => Schema.encodeUnknownSync(PartialDate)(value)).toThrow(/must|Expected|Missing/),
    )
  })
})

describe("PartialDate order", () => {
  const isNotAfter = (start: string, end: string) =>
    isPartialDateNotAfter(decode(start), decode(end))
  const compare = (self: string, that: string) => PartialDateOrder(decode(self), decode(that))

  it("follows the spec's 'not after' examples, including coarser ends", () => {
    expect(isNotAfter("2025-11-12[Europe/London]", "2025-11-12T18:00[Europe/London]")).toBe(true)
    expect(isNotAfter("2025-11-12T10:00[Europe/London]", "2025-11-12[Europe/London]")).toBe(true)
    expect(isNotAfter("1962-09[UTC]", "1962[UTC]")).toBe(true)
    expect(isNotAfter("1962-12-31[UTC]", "1962[UTC]")).toBe(true)
    expect(isNotAfter("1963[UTC]", "1962[UTC]")).toBe(false)
    expect(isNotAfter("2025-11-12T10:00[UTC]", "2025-11-12T09:59[UTC]")).toBe(false)
    expect(isNotAfter("2025-11-12T10:00[UTC]", "2025-11-12T10:00[UTC]")).toBe(true)
    // 01:00 in Kathmandu (+05:45) is the previous day in UTC.
    expect(isNotAfter("2025-11-12T01:00[Asia/Kathmandu]", "2025-11-11[UTC]")).toBe(true)
    expect(isNotAfter("2025-11-12T10:00[Asia/Kathmandu]", "2025-11-12T05:00[UTC]")).toBe(true)
    expect(isNotAfter("2025-11-12T11:00[Asia/Kathmandu]", "2025-11-12T05:00[UTC]")).toBe(false)
  })

  it("sorts by start instant, finer precision first on ties", () => {
    expect(compare("2025-01-01[UTC]", "2025[UTC]")).toBe(-1)
    expect(compare("2025-01-01T00:00[UTC]", "2025-01-01[UTC]")).toBe(-1)
    expect(compare("2025-11-12T09:00[UTC]", "2025-11-12T10:00[UTC]")).toBe(-1)
    expect(compare("2025[UTC]", "2025-09[UTC]")).toBe(-1)
    expect(compare("2025-11-12T10:00[Europe/London]", "2025-11-12T10:00[Europe/Vilnius]")).toBe(1)
  })

  it("reads skipped times with the offset from before the clock change", () => {
    // Vilnius skips 03:00–04:00 on 2026-03-29, so 03:30 is 04:30 local, i.e. 01:30 UTC.
    expect(compare("2026-03-29T03:30[Europe/Vilnius]", "2026-03-29T01:30[UTC]")).toBe(0)
  })

  it("is 'not after' whenever the order sorts it first, and reflexive", () => {
    assertProperty({
      arbitrary: Arbitrary.schema(Schema.Tuple([PartialDate, PartialDate])),
      predicate: ([self, that]) => {
        // Sorting first implies "not after"; the converse fails only for coarser, overlapping ends.
        const sortsFirst = Order.isLessThanOrEqualTo(PartialDateOrder)(self, that)
        expect(!sortsFirst || isPartialDateNotAfter(self, that)).toBe(true)
        expect(isPartialDateNotAfter(self, self)).toBe(true)
        return true
      },
    })
  })
})
