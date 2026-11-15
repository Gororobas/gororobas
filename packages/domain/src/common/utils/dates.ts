// @todo remove `/utils` folder, keep under `common`'s root
import { DateTime, Effect, Match, Option, Order, Schema, SchemaGetter, SchemaIssue } from "effect"

export const nowAsIso = Effect.gen(function* () {
  const now = yield* DateTime.now
  return DateTime.formatIso(now)
})

const partialDateYearFields = {
  year: Schema.Int.check(Schema.isBetween({ minimum: 0, maximum: 9999 })),
  timezone: Schema.String.check(
    Schema.isPattern(/^\w[-\w/+]*$/),
    Schema.makeFilter(
      (timezone) => Option.isSome(DateTime.zoneMakeNamed(timezone)) || "must be an IANA timezone",
      {
        identifier: "PartialDateTimezone",
        title: "IANA timezone",
        description: "Requires a timezone identifier recognized by the runtime's timezone database",
        arbitraryConstraint: {
          patterns: [{ source: "^(UTC|Europe/London|Asia/Kathmandu|US/Eastern)$", flags: "" }],
        },
      },
    ),
  ),
}

const partialDateMonthFields = {
  ...partialDateYearFields,
  month: Schema.Int.check(Schema.isBetween({ minimum: 1, maximum: 12 })),
}
const partialDateDayFields = {
  ...partialDateMonthFields,
  day: Schema.Int.check(Schema.isBetween({ minimum: 1, maximum: 31 })),
}

const daysInMonth = (year: number, month: number): number => {
  const leapYear = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0)
  return month === 2 ? (leapYear ? 29 : 28) : [4, 6, 9, 11].includes(month) ? 30 : 31
}

const PartialDateDecoded = Schema.Union([
  Schema.Struct({ ...partialDateYearFields, precision: Schema.Literal("year") }),
  Schema.Struct({ ...partialDateMonthFields, precision: Schema.Literal("month") }),
  Schema.Struct({ ...partialDateDayFields, precision: Schema.Literal("day") }),
  Schema.Struct({
    ...partialDateDayFields,
    precision: Schema.Literal("time"),
    hour: Schema.Int.check(Schema.isBetween({ minimum: 0, maximum: 23 })),
    minute: Schema.Int.check(Schema.isBetween({ minimum: 0, maximum: 59 })),
  }),
]).check(
  Schema.makeFilter(
    (date) => {
      if (!("day" in date)) return true
      return date.day <= daysInMonth(date.year, date.month) || "must be a valid calendar date"
    },
    {
      identifier: "PartialDateCalendarDate",
      title: "Valid calendar date",
      description: "Checks the day against the Gregorian month's length, including leap years",
    },
  ),
)

const partialDatePattern = /^(\d{4})(?:-(\d{2})(?:-(\d{2})(?:T(\d{2}):(\d{2}))?)?)?\[([-\w/+]+)\]$/

export const PartialDateEncoded = Schema.String.check(Schema.isPattern(partialDatePattern)).pipe(
  Schema.brand("PartialDateEncoded"),
)
export type PartialDateEncoded = typeof PartialDateEncoded.Type

/**
 * Open Evnt partial date: a timezone-qualified string decoded at its stated precision.
 * @link https://evnt.directory/spec/open-evnt-partialdate.html
 */
export const PartialDate = PartialDateEncoded.pipe(
  Schema.decodeTo(PartialDateDecoded, {
    decode: SchemaGetter.transformEffect<typeof PartialDateDecoded.Type, string>((input) => {
      const match = partialDatePattern.exec(input)

      if (!match || match[0] !== input) {
        return Effect.fail(
          new SchemaIssue.InvalidValue({ message: "must be an Open Evnt partial date" }, input),
        )
      }

      const [, year, month, day, hour, minute, timezone] = match
      const fields = { year: Number(year), timezone: timezone ?? "" }
      if (month === undefined) return Effect.succeed({ ...fields, precision: "year" as const })
      const monthFields = { ...fields, month: Number(month) }
      if (day === undefined) return Effect.succeed({ ...monthFields, precision: "month" as const })
      const dayFields = { ...monthFields, day: Number(day) }
      if (hour === undefined) return Effect.succeed({ ...dayFields, precision: "day" as const })

      return Effect.succeed({
        ...dayFields,
        precision: "time" as const,
        hour: Number(hour),
        minute: Number(minute),
      })
    }),
    encode: SchemaGetter.transform((date) => {
      const pad = (value: number) => String(value).padStart(2, "0")
      let encoded = String(date.year).padStart(4, "0")
      if ("month" in date) encoded += `-${pad(date.month)}`
      if ("day" in date) encoded += `-${pad(date.day)}`
      if (date.precision === "time") encoded += `T${pad(date.hour)}:${pad(date.minute)}`
      return Schema.decodeSync(PartialDateEncoded)(`${encoded}[${date.timezone}]`)
    }),
  }),
)

export type PartialDate = typeof PartialDate.Type

/**
 * Epoch milliseconds of a wall-clock time in the date's timezone. "compatible" reads skipped times
 * with the offset from before the change and repeated ones as the first, as the spec requires.
 * Overflowing fields roll over (day 32 is the next month's 1st), which `partialDateEnd` relies on.
 */
const wallClockInstant = ({
  timezone,
  year,
  month = 1,
  day = 1,
  hour = 0,
  minute = 0,
}: {
  readonly timezone: string
  readonly year: number
  readonly month?: number
  readonly day?: number
  readonly hour?: number
  readonly minute?: number
}): number =>
  DateTime.toEpochMillis(
    DateTime.makeZonedUnsafe(
      { year, month, day, hour, minute, second: 0, millisecond: 0 },
      { timeZone: timezone, adjustForTimeZone: true, disambiguation: "compatible" },
    ),
  )

/** The first instant after the period a date covers; a time ends at the instant it starts. */
const partialDateEnd = (date: PartialDate): number =>
  Match.value(date).pipe(
    Match.discriminatorsExhaustive("precision")({
      year: ({ timezone, year }) => wallClockInstant({ timezone, year: year + 1 }),
      month: ({ timezone, year, month }) => wallClockInstant({ timezone, year, month: month + 1 }),
      day: ({ timezone, year, month, day }) =>
        wallClockInstant({ timezone, year, month, day: day + 1 }),
      time: wallClockInstant,
    }),
  )

const precisionRank = { time: 0, day: 1, month: 2, year: 3 } as const

/**
 * Sort order from the spec: by the instant each period starts, in its own timezone, and the finer
 * precision first when two start together (`2025-01-01[UTC]` before `2025[UTC]`).
 * @link https://evnt.directory/spec/open-evnt-partialdate.html#_3-2-order
 */
export const PartialDateOrder: Order.Order<PartialDate> = Order.combine(
  Order.mapInput<number, PartialDate>(Order.Number, wallClockInstant),
  Order.mapInput(Order.Number, (date: PartialDate) => precisionRank[date.precision]),
)

/**
 * Whether a period starting at `start` and ending at `end` is in order, per the spec: `start`'s
 * period begins before `end`'s ends, or both begin together, so "September 1962 to 1962" is in
 * order. This isn't `PartialDateOrder`: overlapping periods are each "not after" the other, and
 * the relation isn't transitive (Sep 1962 ≤ 1962 ≤ Mar 1962, but not Sep ≤ Mar), so no `Order`
 * can express it.
 * @link https://evnt.directory/spec/open-evnt-partialdate.html#_3-2-order
 */
export const isPartialDateNotAfter = (start: PartialDate, end: PartialDate): boolean => {
  const startInstant = wallClockInstant(start)
  return startInstant < partialDateEnd(end) || startInstant === wallClockInstant(end)
}

const pad = (value: number, length: number) => String(value).padStart(length, "0")

/** ISO 8601 at the date's own precision: `1962`, `1962-09`, `1962-09-27`. */
export const partialDateToIso = (date: {
  readonly year: number
  readonly month?: number
  readonly day?: number
}): string =>
  [
    pad(date.year, 4),
    ...(date.month === undefined ? [] : [pad(date.month, 2)]),
    ...(date.day === undefined ? [] : [pad(date.day, 2)]),
  ].join("-")
