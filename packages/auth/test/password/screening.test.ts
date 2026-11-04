import { it } from "@effect/vitest";
import { Password } from "@yielded/auth";
import * as Deferred from "effect/Deferred";
import * as Effect from "effect/Effect";
import * as Fiber from "effect/Fiber";
import * as Layer from "effect/Layer";
import * as Redacted from "effect/Redacted";
import * as TestClock from "effect/testing/TestClock";
import { expect } from "vite-plus/test";

// Requested hardening: a stalled screening provider must fail closed and release its resources.
it.effect("times out stalled screening without retrying it", () =>
  Effect.gen(function* () {
    const started = yield* Deferred.make<void>();
    const completed = yield* Deferred.make<void>();
    let calls = 0;
    let released = false;

    const screening = Layer.succeed(Password.CompromisedPasswords, {
      check: Effect.fnUntraced(
        function* () {
          calls++;
          yield* Deferred.succeed(started, undefined);

          return yield* Effect.never;
        },
        Effect.ensuring(
          Effect.sync(() => {
            released = true;
          }),
        ),
      ),
    });

    const fiber = yield* Effect.flatMap(Password.NewPasswordCheck, (service) =>
      service.check(Redacted.make("a sufficiently long synthetic password")),
    ).pipe(
      Effect.provide(Password.NewPasswordCheck.layer().pipe(Layer.provide(screening))),
      Effect.result,
      Effect.tap(() => Deferred.succeed(completed, undefined)),
      Effect.forkChild,
    );

    yield* Deferred.await(started);
    yield* TestClock.adjust("10 seconds");
    expect(yield* Deferred.isDone(completed)).toBe(true);
    expect(yield* Fiber.join(fiber)).toMatchObject({
      _tag: "Failure",
      failure: { _tag: "PasswordCheckUnavailable" },
    });
    expect(calls).toBe(1);
    expect(released).toBe(true);
  }),
);
