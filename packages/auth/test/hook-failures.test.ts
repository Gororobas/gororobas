import { it } from "@effect/vitest";
import { Hooks } from "@yielded/auth";
import * as Cause from "effect/Cause";
import * as Effect from "effect/Effect";
import * as Exit from "effect/Exit";
import * as Layer from "effect/Layer";
import * as Logger from "effect/Logger";
import * as SqlError from "effect/sql/SqlError";
import { expect } from "vite-plus/test";

const event = Hooks.lifecycleEvent({
  id: Hooks.LifecycleEventId.make("event"),
  occurredAtMillis: 0,
  snapshot: { action: "sign-in", operation: "test/sign-in", identifiers: [] },
});

// 525916648 reports after contribution normalization and catches cancellation.
// A live hook cannot reliably force these causes or assert logger ownership.
it.effect("reports the original hook failure once using the invocation logger", () =>
  Effect.gen(function* () {
    const hook = Hooks.hookContribution("test/failure");
    const captured: Cause.Cause<unknown>[] = [];

    const failure = SqlError.SqlError.make({
      reason: SqlError.ConnectionError.make({
        cause: { code: "ECONNRESET", message: "private-hook" },
      }),
    });

    const services = yield* Layer.build(
      Hooks.composeHooks(hook).pipe(
        Layer.provide(hook.layer({ after: () => Effect.fail(failure) })),
        Layer.provide(Logger.layer([])),
      ),
    );

    const hooks = yield* Hooks.LifecycleHooks.pipe(Effect.provide(services));

    const result = yield* hooks
      .after(event)
      .pipe(Effect.provide(Logger.layer([Logger.make((entry) => captured.push(entry.cause))])));

    expect(result[0]?.status).toBe("failed");
    expect(captured).toHaveLength(1);
    expect(captured[0]?.reasons).toMatchObject([
      { _tag: "Fail", error: { reason: "ConnectionError", code: "ECONNRESET" } },
    ]);
    expect(JSON.stringify(captured)).not.toContain("private-hook");
  }).pipe(Effect.scoped),
);

it.effect("stops post-commit delivery on interruption", () =>
  Effect.gen(function* () {
    const cancelled = Hooks.hookContribution("test/cancelled");
    const next = Hooks.hookContribution("test/next");
    let delivered = false;

    const result = yield* Effect.exit(
      Effect.flatMap(Hooks.LifecycleHooks, (hooks) => hooks.after(event)).pipe(
        Effect.provide(
          Hooks.composeHooks(cancelled, next).pipe(
            Layer.provide(
              Layer.mergeAll(
                cancelled.layer({ after: () => Effect.failCause(Cause.interrupt(123)) }),
                next.layer({
                  after: () =>
                    Effect.sync(() => {
                      delivered = true;
                    }),
                }),
              ),
            ),
          ),
        ),
      ),
    );

    expect(delivered).toBe(false);
    expect(Exit.isFailure(result) && Cause.hasInterrupts(result.cause)).toBe(true);
  }),
);

it.effect("sanitizes foreign contributions without invoking error prototype traps", () =>
  Effect.gen(function* () {
    const captured: Cause.Cause<unknown>[] = [];
    const contribution = Hooks.hookContribution("foreign-hook");

    const failure = new Proxy(Hooks.HookDeliveryFailed.make({}), {
      getPrototypeOf: () => {
        throw new Error("private-prototype-trap");
      },
    });

    const cause = Cause.fromReasons([
      Cause.makeFailReason(failure),
      Cause.makeDieReason(new Error("private-hook-defect")),
      Cause.makeInterruptReason(321),
    ]);

    const result = yield* Effect.exit(
      Effect.flatMap(Hooks.LifecycleHooks, (hooks) => hooks.after(event)).pipe(
        Effect.provide([
          Hooks.composeHooks({
            ...contribution,
            resolve: Effect.succeed({ after: () => Effect.failCause(cause) }),
          }).pipe(Layer.provide(contribution.layer({ after: () => Effect.void }))),
          Logger.layer([Logger.make((entry) => captured.push(entry.cause))]),
        ]),
      ),
    );

    expect(Exit.isFailure(result) && Cause.hasInterrupts(result.cause)).toBe(true);
    expect(Exit.isFailure(result) && Cause.hasDies(result.cause)).toBe(true);
    expect(captured).toHaveLength(1);
    expect(JSON.stringify([result, captured])).not.toContain("private-");
  }),
);
