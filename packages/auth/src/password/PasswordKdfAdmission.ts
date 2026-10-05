import { Context, Effect, Layer, Option, Schema, Semaphore } from "effect";

import { PasswordConfigurationError, PasswordKdfBusy } from "./errors";

const AdmissionConfig = Schema.Struct({
  concurrency: Schema.Int.check(Schema.isBetween({ minimum: 1, maximum: 32 })),
  maxQueued: Schema.Int.check(Schema.isGreaterThanOrEqualTo(0)),
  maxWaitMilliseconds: Schema.Int.check(Schema.isGreaterThan(0)),
});

/** Share ONE Layer instance across hashers in a runtime. This bounds actual
 * nonabortable work, not distributed guesses. Callbacks must finish only after
 * their underlying computation finishes: an already-detached Promise is unsafe.
 * Work includes allocation, derive, comparison and cleanup. Waiting is bounded
 * and interruptible; once work starts, it retains its permit through cleanup.
 */
export class PasswordKdfAdmission extends Context.Service<
  PasswordKdfAdmission,
  {
    readonly run: <A, E, R>(
      work: Effect.Effect<A, E, R>,
    ) => Effect.Effect<A, E | PasswordKdfBusy, R>;
  }
>()("effect-auth/PasswordKdfAdmission") {
  static readonly layer = (
    options: {
      /** Maximum running callbacks, from 1 to 32. Default: 1. */
      readonly concurrency?: number;
      /** Maximum waiting callbacks. Default: 16; use 0 for fail-fast admission. */
      readonly maxQueued?: number;
      /** Positive integer acquisition deadline in milliseconds. Default: 5000. */
      readonly maxWaitMilliseconds?: number;
    } = {},
  ) => {
    const snapshot = {
      concurrency: options.concurrency ?? 1,
      maxQueued: options.maxQueued ?? 16,
      maxWaitMilliseconds: options.maxWaitMilliseconds ?? 5000,
    };

    return Layer.effect(
      this,
      Effect.gen(function* () {
        const config = yield* Schema.decodeEffect(AdmissionConfig)(snapshot).pipe(
          Effect.mapError(() => PasswordConfigurationError.make({ component: "admission" })),
        );

        const capacity = yield* Schema.decodeEffect(Schema.Int)(
          config.concurrency + config.maxQueued,
        ).pipe(Effect.mapError(() => PasswordConfigurationError.make({ component: "admission" })));

        const active = yield* Semaphore.make(config.concurrency);
        const admitted = yield* Semaphore.make(capacity);

        const acquire = Effect.acquireRelease(active.take(1), () => active.release(1), {
          interruptible: true,
        }).pipe(
          Effect.timeoutOrElse({
            duration: config.maxWaitMilliseconds,
            orElse: () => Effect.fail(PasswordKdfBusy.make({})),
          }),
        );

        return PasswordKdfAdmission.of({
          run: <A, E, R>(work: Effect.Effect<A, E, R>) =>
            admitted
              .withPermitsIfAvailable(1)(
                // The Scope outlives the acquisition race and owns any acquired
                // permit, including when timeout or interruption wins at handoff.
                Effect.scoped(Effect.andThen(acquire, Effect.uninterruptible(work))),
              )
              .pipe(
                Effect.flatMap((result) =>
                  Option.isSome(result)
                    ? Effect.succeed(result.value)
                    : Effect.fail(PasswordKdfBusy.make({})),
                ),
              ),
        });
      }),
    );
  };
}
