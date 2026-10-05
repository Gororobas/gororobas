import { it } from "@effect/vitest";
import { PasswordKdfAdmission } from "@yielded/auth/Password";
import { Deferred, Effect, Fiber } from "effect";
import { TestClock } from "effect/testing";
import { expect } from "vite-plus/test";

// Requested security regression: reproduce overlap rejection at the public
// admission boundary and protect permit ownership across deadlines/interruption.
it.effect("waits for overlapping work by default and preserves callback failures", () =>
  Effect.gen(function* () {
    const admission = yield* PasswordKdfAdmission;
    const entered = yield* Deferred.make<void>();
    const finish = yield* Deferred.make<void>();

    const first = yield* admission
      .run(Deferred.succeed(entered, undefined).pipe(Effect.andThen(Deferred.await(finish))))
      .pipe(Effect.forkChild);

    yield* Deferred.await(entered);

    const second = yield* admission
      .run(Effect.succeed("second"))
      .pipe(Effect.result, Effect.forkChild);

    yield* TestClock.adjust(1);
    const waiting = second.pollUnsafe();

    // Release held work before assertions so the original implementation also exits.
    yield* Deferred.succeed(finish, undefined);
    yield* Fiber.join(first);
    const result = yield* Fiber.join(second);
    const failed = yield* admission.run(Effect.fail("callback-failure")).pipe(Effect.result);
    const reused = yield* admission.run(Effect.succeed("reused"));

    expect(waiting).toBeUndefined();
    expect(result).toMatchObject({ _tag: "Success", success: "second" });
    expect(failed).toMatchObject({ _tag: "Failure", failure: "callback-failure" });
    expect(reused).toBe("reused");
  }).pipe(Effect.provide(PasswordKdfAdmission.layer())),
);

const oneQueued = { concurrency: 1, maxQueued: 1, maxWaitMilliseconds: 100 };

it.effect("bounds waiting and reuses capacity after timeout and interruption", () =>
  Effect.gen(function* () {
    const admission = yield* PasswordKdfAdmission;
    const entered = yield* Deferred.make<void>();
    const finish = yield* Deferred.make<void>();
    let unexpectedCalls = 0;

    const unexpected = Effect.sync(() => {
      unexpectedCalls++;
    });

    const first = yield* admission
      .run(Deferred.succeed(entered, undefined).pipe(Effect.andThen(Deferred.await(finish))))
      .pipe(Effect.forkChild);

    yield* Deferred.await(entered);
    const expired = yield* admission.run(unexpected).pipe(Effect.result, Effect.forkChild);

    yield* TestClock.adjust(1);
    const initiallyWaiting = expired.pollUnsafe();
    const overflow = yield* admission.run(unexpected).pipe(Effect.result);

    yield* TestClock.adjust(100);
    const expiredResult = yield* Fiber.join(expired);
    const canceled = yield* admission.run(unexpected).pipe(Effect.result, Effect.forkChild);

    yield* TestClock.adjust(1);
    const waitingBeforeCancel = canceled.pollUnsafe();

    yield* Fiber.interrupt(canceled);

    const replacement = yield* admission
      .run(Effect.succeed("replacement"))
      .pipe(Effect.result, Effect.forkChild);

    yield* TestClock.adjust(1);
    const replacementWaiting = replacement.pollUnsafe();

    yield* Deferred.succeed(finish, undefined);
    yield* Fiber.join(first);
    const replacementResult = yield* Fiber.join(replacement);

    expect(initiallyWaiting).toBeUndefined();
    expect(overflow).toMatchObject({ _tag: "Failure", failure: { _tag: "PasswordKdfBusy" } });
    expect(expiredResult).toMatchObject({ _tag: "Failure", failure: { _tag: "PasswordKdfBusy" } });
    expect(waitingBeforeCancel).toBeUndefined();
    expect(replacementWaiting).toBeUndefined();
    expect(replacementResult).toMatchObject({ _tag: "Success", success: "replacement" });
    expect(unexpectedCalls).toBe(0);
  }).pipe(Effect.provide(PasswordKdfAdmission.layer(oneQueued))),
);

it.effect("retains interrupted running work through cleanup beyond the acquisition deadline", () =>
  Effect.gen(function* () {
    const admission = yield* PasswordKdfAdmission;
    const entered = yield* Deferred.make<void>();
    const finish = yield* Deferred.make<void>();
    const cleaning = yield* Deferred.make<void>();
    const cleaned = yield* Deferred.make<void>();

    const first = yield* admission
      .run(
        Deferred.succeed(entered, undefined).pipe(
          Effect.andThen(Deferred.await(finish)),
          Effect.ensuring(
            Deferred.succeed(cleaning, undefined).pipe(Effect.andThen(Deferred.await(cleaned))),
          ),
        ),
      )
      .pipe(Effect.forkChild);

    yield* Deferred.await(entered);
    yield* TestClock.adjust(101);
    const runningAfterDeadline = first.pollUnsafe();
    const interruption = yield* Fiber.interrupt(first).pipe(Effect.forkChild);

    yield* TestClock.adjust(1);
    const next = yield* admission.run(Effect.succeed("next")).pipe(Effect.result, Effect.forkChild);

    yield* TestClock.adjust(1);
    const waitingDuringWork = next.pollUnsafe();

    yield* Deferred.succeed(finish, undefined);
    yield* Deferred.await(cleaning);
    yield* TestClock.adjust(1);
    const waitingDuringCleanup = next.pollUnsafe();

    yield* Deferred.succeed(cleaned, undefined);
    yield* Fiber.join(interruption);
    const result = yield* Fiber.join(next);

    expect(runningAfterDeadline).toBeUndefined();
    expect(waitingDuringWork).toBeUndefined();
    expect(waitingDuringCleanup).toBeUndefined();
    expect(result).toMatchObject({ _tag: "Success", success: "next" });
  }).pipe(Effect.provide(PasswordKdfAdmission.layer(oneQueued))),
);
