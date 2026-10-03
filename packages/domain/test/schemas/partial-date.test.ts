import { describe, expect, it } from "@effect/vitest"
import { Schema } from "effect"
import * as Arbitrary from "effect/Arbitrary"

import { PartialDate } from "../../src/common/utils/dates.js"
import { assertProperty } from "../../src/testing.js"

const decode = Schema.decodeUnknownSync(PartialDate)
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
    assertProperty(Arbitrary.schema(PartialDate), (date) => {
      expect(decode(encode(date))).toEqual(date)
      return true
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
