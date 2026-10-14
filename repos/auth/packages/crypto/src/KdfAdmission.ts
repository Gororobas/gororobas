import { Context, Effect, Layer, Option, Schema, Semaphore } from "effect";

import { InvalidInput, KdfBusy } from "./Errors";

export interface Options {
  readonly concurrency?: number;
  readonly maxQueued?: number;
  readonly maxWaitMilliseconds?: number;
}

/** Share one Layer across all backend instances to bound actual KDF work. */
export class KdfAdmission extends Context.Service<
  KdfAdmission,
  {
    readonly run: <A, E, R>(work: Effect.Effect<A, E, R>) => Effect.Effect<A, E | KdfBusy, R>;
  }
>()("@yielded/crypto/KdfAdmission") {}

const Configuration = Schema.Struct({
  concurrency: Schema.Int.check(Schema.isBetween({ minimum: 1, maximum: 32 })),
  maxQueued: Schema.Int.check(Schema.isGreaterThanOrEqualTo(0)),
  maxWaitMilliseconds: Schema.Int.check(Schema.isGreaterThan(0)),
});

/**
 * Waiting is interruptible and bounded. The permit covers work and its cleanup;
 * backends protect nonabortable native calls until actual completion. Owned
 * interruptible work can stop and release its resources without finishing a KDF.
 * Nested work in the same fiber shares its permit through scoped cleanup; forked
 * fibers must acquire their own. This covers preparation and cleanup around a KDF.
 * Defaults: one running derivation, sixteen waiting, five-second acquisition wait.
 */
export const layer = (options: Options = {}): Layer.Layer<KdfAdmission, InvalidInput> => {
  const snapshot = {
    concurrency: options.concurrency ?? 1,
    maxQueued: options.maxQueued ?? 16,
    maxWaitMilliseconds: options.maxWaitMilliseconds ?? 5000,
  };

  return Layer.effect(
    KdfAdmission,
    Effect.gen(function* () {
      const config = yield* Schema.decodeEffect(Configuration)(snapshot).pipe(
        Effect.mapError(() => InvalidInput.make({ reason: "parameters" })),
      );

      const capacity = yield* Schema.decodeEffect(Schema.Int)(
        config.concurrency + config.maxQueued,
      ).pipe(Effect.mapError(() => InvalidInput.make({ reason: "parameters" })));

      const active = yield* Semaphore.make(config.concurrency);
      const admitted = yield* Semaphore.make(capacity);
      const owners = new Set<number>();

      const acquire = Effect.acquireRelease(active.take(1), () => active.release(1), {
        interruptible: true,
      }).pipe(
        Effect.timeoutOrElse({
          duration: config.maxWaitMilliseconds,
          orElse: () => Effect.fail(KdfBusy.make({})),
        }),
      );

      return KdfAdmission.of({
        run: <A, E, R>(work: Effect.Effect<A, E, R>) =>
          Effect.withFiber((fiber) => {
            if (owners.has(fiber.id)) return work;

            const owned = Effect.acquireRelease(
              Effect.sync(() => owners.add(fiber.id)),
              () => Effect.sync(() => owners.delete(fiber.id)),
            ).pipe(Effect.andThen(work));

            return admitted
              .withPermitsIfAvailable(1)(Effect.scoped(Effect.andThen(acquire, owned)))
              .pipe(
                Effect.flatMap((result) =>
                  Option.isSome(result)
                    ? Effect.succeed(result.value)
                    : Effect.fail(KdfBusy.make({})),
                ),
              );
          }),
      });
    }),
  );
};
