import { it } from "@effect/vitest";
import * as Kdf from "effect/crypto/Kdf";
import * as Effect from "effect/Effect";
import * as Fiber from "effect/Fiber";
import * as Scheduler from "effect/Scheduler";
import { expect } from "vite-plus/test";

import { argon2 } from "../src/internal/argon2";
import { makeLayer } from "../src/internal/kdf";

const utf8 = (value: string) => new TextEncoder().encode(value);
const layerKdf = makeLayer(argon2);

// d36318f retained native-work masking around the owned portable implementation.
// Control the scheduler to request cancellation between real Argon2 batches;
// wall-clock timing cannot distinguish cancellation from completing the full KDF.
it.effect("cancels portable Argon2 at a batch boundary", () =>
  Effect.gen(function* () {
    const kdf = yield* Kdf.Kdf;
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
      password: utf8("password"),
      salt: utf8("somesalt"),
      memoryKiB: 8192,
      passes: 2,
      parallelism: 1,
      length: 32,
    };

    const derive = (memory: number, passes: number) =>
      kdf.derive(Kdf.argon2id({ memory, passes, parallelism: 1 }), input.password, {
        salt: input.salt,
        length: 32,
      });

    const fiber = yield* derive(input.memoryKiB, input.passes).pipe(
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
    const reused = yield* derive(8, 1);

    expect(suspended).toBe(true);
    expect(stoppedAtBoundary).toBe(true);
    expect(reused).toHaveLength(32);
  }).pipe(Effect.provide(layerKdf)),
);
