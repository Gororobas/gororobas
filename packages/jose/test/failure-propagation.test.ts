import { it } from "@effect/vitest";
import { Cause, Context, Deferred, Effect, Exit, Fiber, Layer, Scope } from "effect";
import { HttpClient, HttpClientResponse } from "effect/http";
import { TestClock } from "effect/testing";
import { expect } from "vite-plus/test";

import { Jwks } from "../src/index";
import { cryptoLayer, publicJwk } from "./fixtures";

// c4752e34b's closed-state publication drops the refresh Exit while the Scope's
// fiber finalizer only joins it. The owner must observe unexpected cleanup
// while releasing its active lookup as closed.
it.effect("surfaces a shared JWKS cleanup failure through its closing owner", () =>
  Effect.gen(function* () {
    const defect = { shutdown: "audit" };
    const owner = yield* Scope.make();
    const entered = yield* Deferred.make<void>();

    const http = HttpClient.make(() =>
      Deferred.succeed(entered, undefined).pipe(
        Effect.andThen(Effect.never),
        Effect.ensuring(Effect.die(defect)),
      ),
    );

    const context = yield* Layer.buildWithScope(
      Jwks.layerRemote({ url: "https://issuer.example/keys" }).pipe(
        Layer.provide(Layer.succeed(HttpClient.HttpClient, http)),
      ),
      owner,
    );

    const active = yield* Effect.forkChild(
      Context.get(context, Jwks.Jwks).resolve({ algorithm: "ES256" }),
    );

    yield* Deferred.await(entered);
    const exit = yield* Effect.exit(Scope.close(owner, Exit.void));

    yield* Fiber.await(active);

    expect(
      Exit.isFailure(exit) &&
        exit.cause.reasons.some(
          (reason) =>
            Cause.isDieReason(reason) &&
            Cause.isCause(reason.defect) &&
            reason.defect.reasons.some(
              (inner) => Cause.isDieReason(inner) && inner.defect === defect,
            ),
        ),
    ).toBe(true);
  }).pipe(Effect.provide(cryptoLayer)),
);

// c4752e34b leaves a shared refresh running after its last waiter cancels.
// Its later failure has no observer. Gate cleanup to prove joining, busy
// admission during stopping, and preservation of the departing caller's Cause.
it.effect("joins the last JWKS waiter's failing cleanup before admitting a new refresh", () =>
  Effect.gen(function* () {
    const defect = { lastWaiter: "audit" };
    const entered = yield* Deferred.make<void>();
    const releaseWork = yield* Deferred.make<void>();
    const releaseCleanup = yield* Deferred.make<void>();
    let requests = 0;
    let running = 0;
    let maximumRunning = 0;

    const http = HttpClient.make((request) =>
      Effect.suspend(() => {
        const first = ++requests === 1;

        running++;
        maximumRunning = Math.max(maximumRunning, running);

        return Effect.gen(function* () {
          if (first) {
            yield* Deferred.succeed(entered, undefined);
            yield* Deferred.await(releaseWork);
          }

          return HttpClientResponse.fromWeb(
            request,
            new Response(JSON.stringify({ keys: [publicJwk] })),
          );
        }).pipe(
          Effect.ensuring(
            Effect.gen(function* () {
              if (first) yield* Deferred.await(releaseCleanup);
              running--;
              if (first) return yield* Effect.die(defect);
            }),
          ),
        );
      }),
    );

    const context = yield* Layer.build(
      Jwks.layerRemote({ url: "https://issuer.example/keys", cooldownMs: 0 }).pipe(
        Layer.provide(Layer.succeed(HttpClient.HttpClient, http)),
      ),
    );

    const keys = Context.get(context, Jwks.Jwks);
    const active = yield* Effect.forkChild(keys.resolve({ algorithm: "ES256" }));

    yield* Deferred.await(entered);
    const stopping = yield* Effect.forkChild(Fiber.interrupt(active), { startImmediately: true });

    yield* Effect.yieldNow;
    const joined = stopping.pollUnsafe() === undefined;

    const contender = yield* Effect.forkChild(keys.resolve({ algorithm: "ES256" }), {
      startImmediately: true,
    });

    yield* Effect.yieldNow;
    const admission = contender.pollUnsafe();

    // Always unblock the pre-fix request and cleanup before asserting.
    yield* Deferred.succeed(releaseWork, undefined);
    yield* Deferred.succeed(releaseCleanup, undefined);
    yield* Fiber.join(stopping);
    yield* Fiber.await(contender);
    const exit = yield* Fiber.await(active);
    const recovered = yield* keys.resolve({ algorithm: "ES256" });

    expect(joined).toBe(true);
    expect(
      admission !== undefined &&
        Exit.isFailure(admission) &&
        admission.cause.reasons.some(
          (reason) =>
            Cause.isFailReason(reason) &&
            reason.error._tag === "JoseJwksUnavailable" &&
            reason.error.reason === "busy",
        ),
    ).toBe(true);
    expect(
      Exit.isFailure(exit) &&
        exit.cause.reasons.some((reason) => Cause.isDieReason(reason) && reason.defect === defect),
    ).toBe(true);
    expect(recovered.jwk).toEqual(publicJwk);
    expect(requests).toBe(2);
    expect(maximumRunning).toBe(1);
  }).pipe(Effect.scoped, Effect.provide(cryptoLayer)),
);

// c4752e34b introduced a timeout that discards its loser's cleanup failure
// (reproduced at 4ea887e2). A controlled transport forces cleanup after timeout;
// existing refresh recovery tests do not produce failing finalizers.
it.effect("retains a JWKS request cleanup defect when the refresh times out", () =>
  Effect.gen(function* () {
    const defect = { timeout: "audit" };
    const entered = yield* Deferred.make<void>();

    const http = HttpClient.make(() =>
      Deferred.succeed(entered, undefined).pipe(
        Effect.andThen(Effect.never),
        Effect.ensuring(Effect.die(defect)),
      ),
    );

    const context = yield* Layer.build(
      Jwks.layerRemote({ url: "https://issuer.example/keys", timeoutMs: 10 }).pipe(
        Layer.provide(Layer.succeed(HttpClient.HttpClient, http)),
      ),
    );

    const active = yield* Effect.forkChild(
      Context.get(context, Jwks.Jwks).resolve({ algorithm: "ES256" }),
    );

    yield* Deferred.await(entered);
    yield* TestClock.adjust(10);
    const exit = yield* Fiber.await(active);

    expect(
      Exit.isFailure(exit) &&
        exit.cause.reasons.some((r) => Cause.isDieReason(r) && r.defect === defect),
    ).toBe(true);
  }).pipe(Effect.scoped, Effect.provide(cryptoLayer)),
);
