import { DateTime, Effect, Option, Schema, SchemaGetter, SchemaIssue } from "effect"

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
      const leapYear = date.year % 4 === 0 && (date.year % 100 !== 0 || date.year % 400 === 0)
      const daysInMonth =
        date.month === 2 ? (leapYear ? 29 : 28) : [4, 6, 9, 11].includes(date.month) ? 30 : 31
      return date.day <= daysInMonth || "must be a valid calendar date"
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

/** Open Evnt partial date: a timezone-qualified string decoded at its stated precision. */
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
      return Schema.decodeUnknownSync(PartialDateEncoded)(`${encoded}[${date.timezone}]`)
    }),
  }),
)
export type PartialDate = typeof PartialDate.Type
