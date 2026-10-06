/**
 * Common primitive types used across the domain.
 */
import { HashSet, Record, Schema, SchemaGetter, SchemaTransformation } from "effect"
import * as Length from "effect-units/Length"
import * as Quantity from "effect-units/Quantity"
import * as Temperature from "effect-units/Temperature"

import { LoroListItemId } from "./ids.js"

/**
 * To be used for all nullish/optional columns in the DB.
 *
 * - decoding: missing values, undefineds or nulls become Option.none()
 * - encoding: Option.some() becomes the Schema; Option.none() becomes `null`
 **/
export const OptionalColumn = <S extends Schema.Schema<unknown>>(s: S) =>
  Schema.OptionFromOptionalNullOr(s, { onNoneEncoding: null })

export const TimestampColumn = Schema.DateTimeUtcFromString
export type TimestampColumn = typeof TimestampColumn.Type

export const TimestampedStruct = Schema.Struct({
  createdAt: TimestampColumn,
  updatedAt: TimestampColumn,
})

/** A username handle (e.g., @username) */
export const Handle = Schema.Trim.pipe(
  Schema.check(Schema.isMinLength(3)),
  Schema.check(Schema.isMaxLength(90)),
  Schema.check(Schema.isPattern(/^[a-z0-9-]+$/)),
  Schema.brand("Handle"),
)

export type Handle = typeof Handle.Type

/**
 * Simple string@string validation.
 * Transforms the input to lowercase before decoding, ensure we get normalized addresses.
 */
export const Email = Schema.String.pipe(
  Schema.decodeTo(
    Schema.String.check(
      Schema.isPattern(/^[^@\s]+@[^@\s]{1,128}$/),
      Schema.isLowercased({ arbitraryConstraint: {} }),
    ),
    SchemaTransformation.toLowerCase(),
  ),
  Schema.brand("Email"),
)

export type Email = typeof Email.Type

export const PaginationOptions = Schema.Struct({
  pageSize: Schema.NumberFromString.pipe(
    Schema.check(Schema.isInt()),
    Schema.check(Schema.isGreaterThanOrEqualTo(0)),
  ),
  currentPage: Schema.NumberFromString.pipe(
    Schema.check(Schema.isInt()),
    Schema.check(Schema.isGreaterThanOrEqualTo(0)),
  ),
})

export type PaginationOptions = typeof PaginationOptions.Type

export const IntNonNegative = Schema.Int.check(Schema.isGreaterThanOrEqualTo(0))

export const NonEmptyTrimmedString = Schema.Trimmed.check(Schema.isNonEmpty())

export const ValidName = NonEmptyTrimmedString.check(Schema.isMinLength(3))

export const ItemInCrdtList = Schema.Struct({
  id: LoroListItemId,
  value: Schema.Any,
})
export type ItemInCrdtList = typeof ItemInCrdtList.Type

/** Contains a Loro-provided $cid to identify it in the CRDT list */
export const NameInCrdtList = Schema.Struct({
  id: LoroListItemId,
  value: ValidName,
}).pipe(Schema.brand("NameInCrdtList"))
export type NameInCrdtList = typeof NameInCrdtList.Type

/**
 * In Loro CRDT documents, will be stored as { literal1: true, literal2: true }
 * During decoding gets transformed into a HashSet.
 **/
export const CrdtLiteralSet = <T extends string, S extends Schema.Literals<ReadonlyArray<T>>>(
  s: S,
) =>
  Schema.Record(s, Schema.optional(Schema.Literal(true))).pipe(
    Schema.decodeTo(Schema.HashSet(s), {
      decode: SchemaGetter.transform((record) =>
        HashSet.fromIterable(
          // @ts-expect-error runtime works, but TS isn't happy. Couldn't find a better way to do this.
          Record.toEntries(record).flatMap(([entry, value]) => (value === true ? [entry] : [])),
        ),
      ),
      // @ts-expect-error runtime works, but TS isn't happy. Couldn't find a better way to do this.
      encode: SchemaGetter.transform((hashSet) =>
        Record.fromIterableWith(hashSet, (entry) => [entry, true] as const),
      ),
    }),
  )

/**
 * In Loro CRDT documents, will be stored as { literal1: true, literal2: true }
 * During decoding gets transformed into a HashSet.
 **/
export const CrdtBrandedStringSet = <S extends Schema.Constraint & Schema.Codec<string, string>>(
  s: S,
) =>
  Schema.Record(Schema.String, Schema.Literal(true)).pipe(
    Schema.decodeTo(Schema.HashSet(s), {
      decode: SchemaGetter.transform((record) =>
        HashSet.fromIterable(
          Record.toEntries(record).flatMap(([entry, value]) => (value === true ? [entry] : [])),
        ),
      ),
      encode: SchemaGetter.transform((hashSet) =>
        Record.fromIterableWith(hashSet, (entry) => [entry, true] as const),
      ),
    }),
  )

const centimetersTransformation = SchemaTransformation.transform({
  decode: Length.centimeters,
  // Persist whole centimeters, including after floating-point unit conversions.
  encode: (length: Length.Length) => Math.round(Length.inCentimeters(length)),
})

export const Centimeters = IntNonNegative.pipe(
  Schema.decodeTo(
    Quantity.nonNegative(
      Length.Length.annotate({
        // Generate whole-centimeter measurements through the same storage conversion.
        toCodecArbitrary: () =>
          Schema.link<Length.Length>()(
            IntNonNegative.check(Schema.isLessThanOrEqualTo(100000)),
            centimetersTransformation,
          ),
      }),
    ),
    centimetersTransformation,
  ),
)

const celsiusNumbers = Schema.Finite.check(Schema.isGreaterThanOrEqualTo(-50))
const celsiusTransformation = SchemaTransformation.transform({
  decode: Temperature.degreesCelsius,
  encode: Temperature.inDegreesCelsius,
})

export const TemperatureInCelsius = celsiusNumbers.pipe(
  Schema.decodeTo(
    Temperature.Temperature.annotate({
      toCodecArbitrary: () =>
        Schema.link<Temperature.Temperature>()(
          celsiusNumbers.check(Schema.isLessThanOrEqualTo(100)),
          celsiusTransformation,
        ),
    }),
    celsiusTransformation,
  ),
)

export const UrlAsString = Schema.Trimmed.check(
  Schema.makeFilter((s) => URL.canParse(s) || "must be an URL", {
    identifier: "UrlAsString",
    title: "Asserts the string can be parsed as an URL",
    description: "Uses URL.canParse",
  }),
)

export const PositiveInteger = Schema.Int.check(Schema.isGreaterThan(0))

export const NonNegativeNumber = Schema.Finite.check(Schema.isGreaterThanOrEqualTo(0))

export const Fraction = Schema.Finite.check(Schema.isBetween({ minimum: 0, maximum: 1 }))
