import { IdGen } from "@gororobas/domain"
import { Clock, DateTime, Duration, Effect, Layer, MutableRef, Random } from "effect"
import { v7 } from "uuid"

/**
 * Repositories stamp rows with `DateTime.now` and `IdGen`. Replacing both with a shared,
 * movable "current time" backdates seeded rows without changing any write path, and
 * makes UUIDv7 identifiers reproducible from the seed.
 *
 * Wall-clock reads outside `at` return the anchor; monotonic time and sleeping use the
 * real clock so timeouts and measurements keep working.
 */
export const makeSeedTimeline = (anchor: DateTime.Utc) =>
  Effect.gen(function* () {
    const random = yield* Random.Random
    const realClock = yield* Clock.Clock
    const anchorMillis = DateTime.toEpochMillis(anchor)
    const current = MutableRef.make(anchorMillis)

    const clock: Clock.Clock = {
      currentTimeMillisUnsafe: () => MutableRef.get(current),
      currentTimeMillis: Effect.sync(() => MutableRef.get(current)),
      currentTimeNanosUnsafe: () => BigInt(MutableRef.get(current)) * 1_000_000n,
      currentTimeNanos: Effect.sync(() => BigInt(MutableRef.get(current)) * 1_000_000n),
      monotonicTimeNanosUnsafe: () => realClock.monotonicTimeNanosUnsafe(),
      monotonicTimeNanos: realClock.monotonicTimeNanos,
      sleep: (duration) => realClock.sleep(duration),
    }

    const idGen = {
      generate: () =>
        v7({
          msecs: MutableRef.get(current),
          random: Uint8Array.from({ length: 16 }, () => random.nextIntUnsafe() & 0xff),
        }),
    }

    /** Runs `effect` as if it happened at `millis`. */
    const at =
      (millis: number) =>
      <A, E, R>(effect: Effect.Effect<A, E, R>) =>
        Effect.sync(() => MutableRef.set(current, Math.min(millis, anchorMillis))).pipe(
          Effect.andThen(effect),
          Effect.ensuring(Effect.sync(() => MutableRef.set(current, anchorMillis))),
        )

    /** A random instant in `[from, anchor]`, skewed towards recent activity. */
    const between = (from: number, until = anchorMillis) =>
      Effect.map(Random.next, (value) => Math.round(from + (until - from) * Math.sqrt(value)))

    const daysBeforeAnchor = (days: number) => anchorMillis - Duration.toMillis(Duration.days(days))

    return {
      anchorMillis,
      at,
      between,
      daysBeforeAnchor,
      layer: Layer.mergeAll(Layer.succeed(Clock.Clock, clock), Layer.succeed(IdGen, idGen)),
    }
  })

export type SeedTimeline = Effect.Success<ReturnType<typeof makeSeedTimeline>>
