/**
 * Common primitive types used across the domain.
 */
import { Schema, SchemaTransformation } from "effect"

export const TimestampColumn = Schema.DateTimeUtcFromString

export const TimestampedStruct = Schema.Struct({
  createdAt: TimestampColumn,
  updatedAt: TimestampColumn,
})

/** A username handle (e.g., @username) */
export const Handle = Schema.String.pipe(
  Schema.check(Schema.isMinLength(3)),
  Schema.check(Schema.isMaxLength(30)),
  Schema.check(Schema.isPattern(/^[a-z0-9_-]+$/)),
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
