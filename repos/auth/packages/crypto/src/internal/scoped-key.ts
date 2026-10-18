import { Cause, Effect, Exit, Fiber, Scope } from "effect";

import { CryptoUnavailable, type OperationError } from "../Errors";

/** Join native calls before releasing a key, including parallel parent closure. */
export const makeScopedKey = Effect.fnUntraced(function* (
  acquire: Effect.Effect<CryptoKey, OperationError>,
) {
  const scope = yield* Scope.fork(yield* Effect.scope, "sequential");
  let imported: CryptoKey | undefined;

  yield* Scope.addFinalizer(
    scope,
    Effect.sync(() => {
      imported = undefined;
    }),
  );

  const available = Effect.suspend(() =>
    scope.state._tag === "Closed" ? Effect.fail(CryptoUnavailable.make({})) : Effect.void,
  );

  const run = <A, E>(operation: Effect.Effect<A, E>) =>
    Effect.suspend(() => {
      let delivered = false;

      return Effect.acquireUseRelease(
        available.pipe(
          Effect.andThen(
            Effect.forkIn(operation, scope, { uninterruptible: false, startImmediately: true }),
          ),
        ),
        (fiber) =>
          Effect.uninterruptibleMask((restore) =>
            Effect.gen(function* () {
              const exit = yield* restore(Fiber.await(fiber));

              delivered = true;
              if (scope.state._tag === "Closed") {
                if (Exit.isFailure(exit) && !Cause.hasInterruptsOnly(exit.cause))
                  return yield* Effect.failCause(
                    Cause.map(exit.cause, () => CryptoUnavailable.make({})),
                  );

                return yield* CryptoUnavailable.make({});
              }

              return yield* exit;
            }),
          ),
        (fiber) =>
          Effect.gen(function* () {
            yield* Fiber.interrupt(fiber);
            const exit = yield* Fiber.await(fiber);

            // Interruption joins native work; its failure still belongs to the caller.
            if (!delivered && Exit.isFailure(exit) && !Cause.hasInterruptsOnly(exit.cause))
              return yield* Effect.failCause(exit.cause);
          }),
      );
    });

  yield* run(
    acquire.pipe(
      Effect.tap((key) =>
        Effect.sync(() => {
          imported = key;
        }),
      ),
      Effect.uninterruptible,
    ),
  ).pipe(Effect.onExit((exit) => (Exit.isFailure(exit) ? Scope.close(scope, exit) : Effect.void)));

  return <A, E>(operation: (key: CryptoKey) => Effect.Effect<A, E>) =>
    run(
      Effect.suspend((): Effect.Effect<A, E | CryptoUnavailable> => {
        const key = imported;

        return key === undefined ? Effect.fail(CryptoUnavailable.make({})) : operation(key);
      }).pipe(Effect.uninterruptible),
    );
});
