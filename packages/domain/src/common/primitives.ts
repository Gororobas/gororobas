/**
 * Common primitive types used across the domain.
 */
import { Schema } from "effect"

export const TimestampedStruct = Schema.Struct({
  createdAt: Schema.DateFromString,
  updatedAt: Schema.DateFromString,
})

/** A username handle (e.g., @username) */
export const Handle = Schema.String.pipe(
  Schema.minLength(3),
  Schema.maxLength(30),
  Schema.pattern(/^[a-z0-9_-]+$/),
  Schema.brand("Handle"),
)
export type Handle = typeof Handle.Type

const emailRegex = /^[\w.-]+@[\w.-]+\.\w{2,}$/i

export const Email = Schema.Lowercase.pipe(
  Schema.pattern(emailRegex, {
    message: () => "Invalid email format",
  }),
  Schema.brand("Email"),
)
export type Email = typeof Email.Type

export const PaginationOptions = Schema.Struct({
  pageSize: Schema.NumberFromString.pipe(Schema.int(), Schema.positive()),
  currentPage: Schema.NumberFromString.pipe(Schema.int(), Schema.positive()),
})
export type PaginationOptions = typeof PaginationOptions.Type
