import * as Context from "effect/Context";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Schema from "effect/Schema";
import * as Semaphore from "effect/Semaphore";

import { PasswordConfigurationError, PasswordKdfBusy } from "./errors";

export interface Options {
  readonly concurrency?: number;
  readonly maxQueued?: number;
  readonly maxWaitMilliseconds?: number;
}

/** Share one Layer across password hashers to bound concurrent password work. */
export class KdfAdmission extends Context.Service<
  KdfAdmission,
  {
    readonly run: <A, E, R>(
      work: Effect.Effect<A, E, R>,
    ) => Effect.Effect<A, E | PasswordKdfBusy, R>;
  }
>()("effect-auth/PasswordKdfAdmission") {
  static readonly layer = (options: Options = {}) => layer(options);
}

const Configuration = Schema.Struct({
  concurrency: Schema.Int.check(Schema.isBetween({ minimum: 1, maximum: 32 })),
  maxQueued: Schema.Int.check(Schema.isGreaterThanOrEqualTo(0)),
  maxWaitMilliseconds: Schema.Int.check(Schema.isGreaterThan(0)),
});

/**
 * Waiting is interruptible and bounded. The permit covers work and its cleanup;
 * backends protect nonabortable native calls until actual completion. Owned
 * interruptible work can stop and release its resources without finishing a KDF.
 * One permit covers the complete password operation, including scoped cleanup.
 * Defaults: one running derivation, sixteen waiting, five-second acquisition wait.
 */
export const layer = (
  options: Options = {},
): Layer.Layer<KdfAdmission, PasswordConfigurationError> => {
  const snapshot = {
    concurrency: options.concurrency ?? 1,
    maxQueued: options.maxQueued ?? 16,
    maxWaitMilliseconds: options.maxWaitMilliseconds ?? 5000,
  };

  return Layer.effect(
    KdfAdmission,
    Effect.gen(function* () {
      const config = yield* Schema.decodeEffect(Configuration)(snapshot).pipe(
        Effect.mapError(() => PasswordConfigurationError.make({ component: "hashing" })),
      );

      const capacity = yield* Schema.decodeEffect(Schema.Int)(
        config.concurrency + config.maxQueued,
      ).pipe(Effect.mapError(() => PasswordConfigurationError.make({ component: "hashing" })));

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

      return KdfAdmission.of({
        run: <A, E, R>(work: Effect.Effect<A, E, R>) =>
          admitted
            .withPermitsIfAvailable(1)(Effect.scoped(Effect.andThen(acquire, work)))
            .pipe(
              Effect.flatMap((result) => Effect.fromOption(result, () => PasswordKdfBusy.make({}))),
            ),
      });
    }),
  );
};
