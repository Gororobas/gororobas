import { it } from "@effect/vitest";
import * as Cause from "effect/Cause";
import * as Deferred from "effect/Deferred";
import * as Effect from "effect/Effect";
import * as Exit from "effect/Exit";
import * as Fiber from "effect/Fiber";
import * as HttpClient from "effect/http/HttpClient";
import * as Scope from "effect/Scope";
import * as TestClock from "effect/testing/TestClock";
import { expect } from "vite-plus/test";

import { OAuth } from "../src/index";
import { codeInput, options } from "./fixtures";

// c4752e34b introduced joins that discard failing cleanup Exits in ownership
// and transport (reproduced at 4ea887e2). Control cleanup to distinguish the
// three termination paths; live providers cannot reliably force this race.
for (const termination of ["owner", "caller", "timeout"] as const) {
  it.effect(`preserves OAuth cleanup defects during ${termination} termination`, () =>
    Effect.gen(function* () {
      const defect = { cleanup: termination };
      const owner = yield* Scope.make();
      const entered = yield* Deferred.make<void>();
      let requests = 0;
      let cleaned = false;

      const http = HttpClient.make(() =>
        Effect.sync(() => {
          requests++;
        }).pipe(
          Effect.andThen(Deferred.succeed(entered, undefined)),
          Effect.andThen(Effect.never),
          Effect.ensuring(
            Effect.sync(() => {
              cleaned = true;
            }).pipe(Effect.andThen(Effect.die(defect))),
          ),
        ),
      );

      const client = yield* OAuth.make({ ...options, timeoutMs: 10 }).pipe(
        Effect.provideService(Scope.Scope, owner),
        Effect.provideService(HttpClient.HttpClient, http),
      );

      const active = yield* Effect.forkChild(client.codeGrant(codeInput));

      yield* Deferred.await(entered);
      if (termination === "owner") yield* Scope.close(owner, Exit.void);
      if (termination === "caller") yield* Fiber.interrupt(active);
      if (termination === "timeout") yield* TestClock.adjust(10);
      const exit = yield* Fiber.await(active);

      yield* Scope.close(owner, Exit.void);
      expect(cleaned).toBe(true);
      expect(requests).toBe(1);
      expect(
        Exit.isFailure(exit) &&
          exit.cause.reasons.some((r) => Cause.isDieReason(r) && r.defect === defect),
      ).toBe(true);
    }),
  );
}
