import { it } from "@effect/vitest";
import type { KdfBusy, OperationError } from "@yielded/crypto/Errors";
import { Kdf } from "@yielded/crypto/Kdf";
import * as KdfAdmission from "@yielded/crypto/KdfAdmission";
import * as Portable from "@yielded/crypto/Portable";
import * as WebCrypto from "@yielded/crypto/WebCrypto";
import { Deferred, Effect, Fiber, Layer, Redacted, Scheduler } from "effect";
import { TestClock } from "effect/testing";
import { expect } from "vite-plus/test";

import { utf8 } from "./backends";

// d36318f retained native-work masking around the owned portable implementation.
// Control the scheduler to request cancellation between real Argon2 batches;
// wall-clock timing cannot distinguish cancellation from completing the full KDF.
it.effect("cancels portable Argon2 at a batch boundary and releases admission", () =>
  Effect.gen(function* () {
    const kdf = yield* Kdf;
    const tasks: Array<() => void> = [];

    const scheduler: Scheduler.Scheduler = {
      executionMode: "sync",
      shouldYield: () => false,
      makeDispatcher: () => ({
        scheduleTask: (task) => tasks.push(task),
        flush: () => {
          while (tasks.length > 0) tasks.shift()!();
        },
      }),
    };

    const input = {
      password: Redacted.make(utf8("password")),
      salt: utf8("somesalt"),
      memoryKiB: 8192,
      passes: 2,
      parallelism: 1,
      length: 32,
    };

    const fiber = yield* kdf
      .argon2id(input)
      .pipe(
        Effect.provideService(Scheduler.Scheduler, scheduler),
        Effect.forkChild({ startImmediately: true }),
      );

    const suspended = tasks.length > 0 && fiber.pollUnsafe() === undefined;

    const interruption = yield* Fiber.interrupt(fiber).pipe(
      Effect.forkChild({ startImmediately: true }),
    );

    for (const task of tasks.splice(0)) task();
    const stoppedAtBoundary = fiber.pollUnsafe() !== undefined;

    // Finish queued work before asserting so a failing regression cannot leak it.
    while (tasks.length > 0) tasks.shift()!();
    yield* Fiber.join(interruption);
    const reused = yield* kdf.argon2id({ ...input, memoryKiB: 8, passes: 1 });

    expect(suspended).toBe(true);
    expect(stoppedAtBoundary).toBe(true);
    expect(Redacted.value(reused)).toHaveLength(32);
  }).pipe(
    Effect.provide(
      Portable.layer(globalThis.crypto.subtle).pipe(
        Layer.provide(KdfAdmission.layer({ concurrency: 1, maxQueued: 0 })),
      ),
    ),
  ),
);

// Admission must be retained until native KDF completion.
// A real backend operation is held at its nonabortable WebCrypto promise boundary;
// wall-clock KDF timing cannot reliably force this interruption window.
it.effect("holds KDF admission through interrupted native work and bounds queued callers", () =>
  Effect.gen(function* () {
    const entered = yield* Deferred.make<void, OperationError | KdfBusy>();
    let finish: ((value: ArrayBuffer) => void) | undefined;
    let calls = 0;

    const subtle = new Proxy(globalThis.crypto.subtle, {
      get(target, property) {
        if (property === "deriveBits") {
          return (...args: Parameters<SubtleCrypto["deriveBits"]>) => {
            calls++;
            if (calls !== 1) return target.deriveBits(...args);

            return new Promise<ArrayBuffer>((resolve) => {
              finish = resolve;
              Deferred.doneUnsafe(entered, Effect.void);
            });
          };
        }
        const value = Reflect.get(target, property, target);

        return typeof value === "function" ? value.bind(target) : value;
      },
    });

    const run = Effect.gen(function* () {
      const kdf = yield* Kdf;

      const input = {
        password: Redacted.make(utf8("password")),
        salt: utf8("salt"),
        iterations: 1,
        length: 32,
      };

      const first = yield* kdf.pbkdf2(input).pipe(
        Effect.tapError((error) => Deferred.fail(entered, error)),
        Effect.forkChild,
      );

      yield* Deferred.await(entered);
      const interruption = yield* Fiber.interrupt(first).pipe(Effect.forkChild);
      const queued = yield* kdf.pbkdf2(input).pipe(Effect.result, Effect.forkChild);

      yield* TestClock.adjust(1);
      const overflow = yield* kdf.pbkdf2(input).pipe(Effect.result);

      yield* TestClock.adjust(100);
      const expired = yield* Fiber.join(queued);
      const workPending = interruption.pollUnsafe();
      const callsBeforeCompletion = calls;

      finish?.(new ArrayBuffer(32));
      yield* Fiber.join(interruption);
      const reused = yield* kdf.pbkdf2(input);

      expect(overflow).toMatchObject({ _tag: "Failure", failure: { _tag: "CryptoKdfBusy" } });
      expect(expired).toMatchObject({ _tag: "Failure", failure: { _tag: "CryptoKdfBusy" } });
      expect(workPending).toBeUndefined();
      expect(callsBeforeCompletion).toBe(1);
      expect(Redacted.value(reused)).toHaveLength(32);
      expect(calls).toBe(2);
    });

    yield* run.pipe(
      Effect.provide(
        WebCrypto.layer(subtle).pipe(
          Layer.provide(
            KdfAdmission.layer({ concurrency: 1, maxQueued: 1, maxWaitMilliseconds: 100 }),
          ),
        ),
      ),
    );
  }),
);

it.effect("rejects invalid KDF admission configuration at Layer construction", () =>
  Effect.gen(function* () {
    const result = yield* Effect.scoped(Layer.build(KdfAdmission.layer({ concurrency: 0 }))).pipe(
      Effect.flip,
    );

    expect(result).toMatchObject({ _tag: "CryptoInvalidInput", reason: "parameters" });
  }),
);

// Direct Auth adoption needs one admission region around the whole password
// operation; its nested Kdf call must reuse that permit without admitting children.
it.effect("shares admission with nested work in the same fiber but not forked children", () =>
  Effect.gen(function* () {
    const admission = yield* KdfAdmission.KdfAdmission;

    const result = yield* admission.run(
      Effect.gen(function* () {
        const nested = yield* admission.run(Effect.succeed("nested"));

        const child = yield* admission
          .run(Effect.succeed("child"))
          .pipe(Effect.result, Effect.forkChild);

        return { nested, child: yield* Fiber.join(child) };
      }),
    );

    expect(result).toMatchObject({
      nested: "nested",
      child: { _tag: "Failure", failure: { _tag: "CryptoKdfBusy" } },
    });
    expect(yield* admission.run(Effect.succeed("reused"))).toBe("reused");
  }).pipe(Effect.provide(KdfAdmission.layer({ concurrency: 1, maxQueued: 0 }))),
);

// 3b9c0fe removed admission ownership before the work's scoped finalizers ran.
it.effect("retains same-fiber admission through scoped cleanup", () =>
  Effect.gen(function* () {
    const admission = yield* KdfAdmission.KdfAdmission;
    const cleanup = yield* Deferred.make<string, KdfBusy>();

    yield* admission.run(
      Effect.addFinalizer(() =>
        Deferred.complete(cleanup, admission.run(Effect.succeed("cleaned"))),
      ),
    );

    expect(yield* Deferred.await(cleanup).pipe(Effect.result)).toMatchObject({
      _tag: "Success",
      success: "cleaned",
    });
  }).pipe(Effect.scoped, Effect.provide(KdfAdmission.layer({ concurrency: 1, maxQueued: 0 }))),
);
