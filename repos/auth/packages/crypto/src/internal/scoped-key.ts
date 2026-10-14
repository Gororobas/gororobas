import { Effect, Exit, Fiber, Scope } from "effect";

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
    Effect.acquireUseRelease(
      available.pipe(
        Effect.andThen(
          Effect.forkIn(operation, scope, { uninterruptible: false, startImmediately: true }),
        ),
      ),
      (fiber) =>
        Effect.gen(function* () {
          const exit = yield* Fiber.await(fiber);

          yield* available;

          return yield* exit;
        }),
      Fiber.interrupt,
    );

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
