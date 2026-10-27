import type { InvalidCrdtUpdateError } from "@gororobas/domain"
import { Effect, Schedule, Schema } from "effect"
import type { SqlError } from "effect/sql"

/** Workflow activities journal their errors as JSON, so failures must be serializable. */
export class LinkInferencePersistenceError extends Schema.TaggedError<LinkInferencePersistenceError>()(
  "LinkInferencePersistenceError",
  { message: Schema.String, retryable: Schema.Boolean, cause: Schema.Defect() },
) {}

export const withPersistenceRetries = <A, R>(
  effect: Effect.Effect<A, Schema.SchemaError | SqlError.SqlError | InvalidCrdtUpdateError, R>,
) =>
  effect.pipe(
    Effect.catchTags({
      SqlError: (cause) =>
        Effect.fail(
          new LinkInferencePersistenceError({
            message: "Link inference persistence failed",
            retryable: true,
            cause,
          }),
        ),
      InvalidCrdtUpdateError: (cause) =>
        Effect.fail(
          new LinkInferencePersistenceError({
            message: "Unreadable CRDT document",
            retryable: false,
            cause,
          }),
        ),
      SchemaError: (cause) =>
        Effect.fail(
          new LinkInferencePersistenceError({
            message: "Invalid link inference data",
            retryable: false,
            cause,
          }),
        ),
    }),
    Effect.retry({
      times: 3,
      schedule: Schedule.exponential("200 millis"),
      while: (error) => error.retryable,
    }),
  )
