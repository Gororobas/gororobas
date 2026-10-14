import { DateTime, Duration, Effect, Layer, Schedule, Schema } from "effect"
import { SqlClient, SqlSchema } from "effect/sql"

/** Long enough to find a code in a slow inbox; short enough that typos don't hold addresses hostage. */
export const UNCLAIMED_ACCOUNT_LIFETIME = Duration.days(1)

export const deleteUnclaimedAccounts = SqlSchema.void({
  Request: Schema.Struct({ createdBefore: Schema.DateTimeUtcFromString }),
  execute: ({ createdBefore }) =>
    SqlClient.SqlClient.use(
      (sql) =>
        sql`DELETE FROM auth_subjects WHERE claimed_at IS NULL AND created_at < ${createdBefore}`,
    ),
})

export const cleanUpUnclaimedAccounts = Effect.gen(function* () {
  const now = yield* DateTime.now
  yield* deleteUnclaimedAccounts({
    createdBefore: DateTime.subtractDuration(now, UNCLAIMED_ACCOUNT_LIFETIME),
  })
}).pipe(Effect.withSpan("Authentication.cleanUpUnclaimedAccounts"))

export const UnclaimedAccountsCleanupLive = Layer.effectDiscard(
  cleanUpUnclaimedAccounts.pipe(
    Effect.catchCause((cause) => Effect.logWarning("Unclaimed accounts cleanup failed", cause)),
    Effect.repeat(Schedule.spaced("1 hour")),
    Effect.forkScoped,
  ),
)
