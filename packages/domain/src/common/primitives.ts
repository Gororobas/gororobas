/**
 * Common primitive types used across the domain.
 */
import { Schema, SchemaTransformation } from "effect"

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
  Schema.check(Schema.isMaxLength(30)),
  Schema.check(Schema.isPattern(/^[a-z0-9-]+$/)),
  Schema.brand("Handle"),
)
export type Handle = typeof Handle.Type

const emailRegex = /^[\w.-]+@[\w.-]+\.\w{2,}$/i

export const Email = Schema.String.pipe(
  Schema.decodeTo(Schema.String, SchemaTransformation.toLowerCase()),
  Schema.check(
    Schema.isPattern(emailRegex, {
      message: "Invalid email format",
    }),
  ),
  Schema.annotate({
    toArbitrary: () => (fc) => fc.emailAddress().map((s) => s.toLowerCase()),
  }),
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

/** Contains a Loro-provided $cid to identify it in the CRDT list */
export const NameInCrdtList = Schema.Struct({
  $cid: Schema.optional(Schema.String),
  value: NonEmptyTrimmedString,
}).pipe(Schema.brand("NameInCrdtList"))
export type NameInCrdtList = typeof NameInCrdtList.Type
