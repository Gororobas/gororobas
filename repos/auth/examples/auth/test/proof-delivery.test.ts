import { it } from "@effect/vitest";
import { Hooks, Proofs, WebCrypto } from "@yielded/auth";
import { Deferred, Effect, Fiber, Layer, Logger, Redacted } from "effect";
import { TestClock } from "effect/testing";
import { expect } from "vite-plus/test";

import { makeExampleProofAuthority } from "../src/proof-consumer";

// Human-requested security regression: provider latency must not reveal proof eligibility.
const proofs = Proofs.make({
  namespace: "test/delivery-response",
  purpose: Proofs.ProofPurpose.make("phone-sign-in"),
  binding: Proofs.IdentifierProofBinding,
  channel: "sms",
  secret: { _tag: "Token" },
  policy: {
    ...Proofs.defaultProofPolicy,
    abuse: { ...Proofs.defaultProofPolicy.abuse, resendCooldownMillis: 0 },
  },
});

const base = Layer.mergeAll(
  WebCrypto.layerWebCrypto,
  Hooks.LifecycleHooks.empty,
  Proofs.ProofKeys.layer({
    activeKeyId: "test",
    keys: [{ id: "test", material: Redacted.make("AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA") }],
  }),
);

const authority = Layer.unwrap(makeExampleProofAuthority).pipe(Layer.provide(base));
const invocation = { _tag: "System", authority: "test-method" } as const;

const input = (requestId: string, eligible = true) => ({
  requestId: Proofs.ProofRequestId.make(requestId),
  binding: {
    _tag: "Identifier" as const,
    flowId: requestId,
    contextDigest: "delivery-regression",
    identifier: { namespace: "phone", value: "+15555550123" },
  },
  locale: "en",
  eligible,
});

it.effect("delivers outside the request scope without an application scheduler", () =>
  Effect.gen(function* () {
    const providerEntered = yield* Deferred.make<void>();
    const providerRelease = yield* Deferred.make<void>();
    const providerCompleted = yield* Deferred.make<void>();

    const delivery = Proofs.SmsProofDelivery.layer({ vendorId: "test", idempotencyMillis: 0 }, () =>
      Effect.gen(function* () {
        yield* Deferred.succeed(providerEntered, undefined);
        yield* Deferred.await(providerRelease);
        yield* Deferred.succeed(providerCompleted, undefined);

        return { _tag: "Accepted" as const };
      }),
    );

    const live = proofs.handlersLayer.pipe(
      Layer.provide(proofs.smsLayer),
      Layer.provide([base, authority, delivery]),
    );

    yield* Effect.gen(function* () {
      const response = yield* proofs.operations.Request.invoke(invocation, input("default")).pipe(
        Effect.scoped,
        Effect.timeout("1 second"),
        Effect.result,
        Effect.forkChild,
      );

      yield* Deferred.await(providerEntered);
      yield* TestClock.adjust("1 second");
      const result = yield* Fiber.join(response);

      expect(result._tag).toBe("Success");
      if (result._tag !== "Success") return;
      expect(result.success.requestId).toBe("default");
      expect(yield* Deferred.isDone(providerCompleted)).toBe(false);

      // The request scope has closed; the application's default worker is still alive.
      yield* Deferred.succeed(providerRelease, undefined);
      yield* Deferred.await(providerCompleted);
    }).pipe(Effect.provide(live));
  }),
);

it.effect("keeps delivery alive after a task interrupts while retaining scoped shutdown", () =>
  Effect.gen(function* () {
    const firstStarted = yield* Deferred.make<void>();
    const completed = yield* Deferred.make<void>();
    const inFlight = yield* Deferred.make<void>();
    const finalized = yield* Deferred.make<void>();

    const scheduler = yield* Effect.gen(function* () {
      const scheduler = yield* Proofs.ProofDispatchScheduler;

      yield* scheduler.schedule(
        Deferred.succeed(firstStarted, undefined).pipe(Effect.andThen(Effect.interrupt)),
      );
      yield* Deferred.await(firstStarted);
      yield* scheduler.schedule(Deferred.succeed(completed, undefined).pipe(Effect.asVoid));

      const waiting = yield* Deferred.await(completed).pipe(
        Effect.timeout("1 second"),
        Effect.result,
        Effect.forkChild,
      );

      yield* TestClock.adjust("1 second");
      expect((yield* Fiber.join(waiting))._tag).toBe("Success");

      yield* scheduler.schedule(
        Deferred.succeed(inFlight, undefined).pipe(
          Effect.andThen(Effect.never),
          Effect.ensuring(Deferred.succeed(finalized, undefined)),
        ),
      );
      yield* Deferred.await(inFlight);

      return scheduler;
    }).pipe(Effect.provide(Proofs.ProofDispatchScheduler.layer));

    expect(yield* Deferred.isDone(finalized)).toBe(true);
    expect(yield* scheduler.schedule(Effect.void).pipe(Effect.flip)).toBeInstanceOf(
      Proofs.ProofUnavailable,
    );
  }),
);

it.effect("returns every committed receipt before host-owned delivery completes", () =>
  Effect.gen(function* () {
    const reachedBoundary = yield* Deferred.make<void>();
    const providerEntered = yield* Deferred.make<void>();
    const providerRelease = yield* Deferred.make<void>();
    const pending: Effect.Effect<void>[] = [];
    let sends = 0;

    const host = Layer.succeed(Proofs.ProofDispatchScheduler, {
      schedule: (work) =>
        Effect.suspend(() =>
          pending.length === 3
            ? Proofs.ProofUnavailable.make({})
            : Effect.sync(() => pending.push(work)).pipe(
                Effect.andThen(Deferred.succeed(reachedBoundary, undefined)),
                Effect.asVoid,
              ),
        ),
    });

    const delivery = Proofs.SmsProofDelivery.layer({ vendorId: "test", idempotencyMillis: 0 }, () =>
      Effect.gen(function* () {
        sends++;
        yield* Deferred.succeed(reachedBoundary, undefined);
        yield* Deferred.succeed(providerEntered, undefined);
        yield* Deferred.await(providerRelease);

        return { _tag: "Accepted" as const };
      }),
    );

    const live = proofs.handlersLayer.pipe(
      Layer.provide(proofs.smsLayer),
      Layer.provide([base, authority, delivery, host]),
    );

    yield* Effect.gen(function* () {
      const request = proofs.operations.Request.invoke(invocation, input("eligible"));

      const response = yield* request.pipe(
        Effect.scoped,
        Effect.timeout("1 second"),
        Effect.result,
        Effect.forkChild,
      );

      yield* Deferred.await(reachedBoundary);
      yield* TestClock.adjust("1 second");
      const result = yield* Fiber.join(response);

      expect(result._tag).toBe("Success");
      if (result._tag !== "Success") return;
      expect(yield* Deferred.isDone(providerEntered)).toBe(false);

      const replay = yield* request;

      const suppressed = yield* proofs.operations.Request.invoke(
        invocation,
        input("suppressed", false),
      );

      expect(replay).toEqual(result.success);
      expect(suppressed.requestId).toBe("suppressed");
      expect(pending).toHaveLength(3);

      for (const eligible of [false, true]) {
        const full = input(`full-${eligible}`, eligible);

        expect(
          yield* proofs.operations.Request.invoke(invocation, {
            ...full,
            binding: { ...full.binding, identifier: { namespace: "phone", value: "+15555550124" } },
          }).pipe(Effect.flip),
        ).toBeInstanceOf(Proofs.ProofUnavailable);
      }

      // The request scope has closed. The host now owns delivery and its lifetime.
      const drain = yield* Effect.forEach(pending, (work) => work).pipe(Effect.forkChild);

      yield* Deferred.await(providerEntered);
      expect(sends).toBe(1);
      yield* Deferred.succeed(providerRelease, undefined);
      yield* Fiber.join(drain);
      expect(sends).toBe(1);
    }).pipe(Effect.provide(live));
  }),
);

it.effect("contains private provider defects inside the host-owned task", () =>
  Effect.gen(function* () {
    const pending: Effect.Effect<void>[] = [];
    const logs: string[] = [];

    const logger = Logger.make((entry) =>
      logs.push(JSON.stringify(Logger.formatStructured.log(entry))),
    );

    const live = proofs.handlersLayer.pipe(
      Layer.provide(proofs.smsLayer),
      Layer.provide([
        base,
        authority,
        Layer.succeed(Proofs.ProofDispatchScheduler, {
          schedule: (work) =>
            Effect.sync(() => {
              pending.push(work);
            }),
        }),
        Proofs.SmsProofDelivery.layer({ vendorId: "test", idempotencyMillis: 0 }, () =>
          Effect.die(new Error("private-provider-body-marker")),
        ),
      ]),
    );

    yield* Effect.gen(function* () {
      const receipt = yield* proofs.operations.Request.invoke(invocation, input("provider-defect"));

      expect(receipt.requestId).toBe("provider-defect");
      expect(pending).toHaveLength(1);
      yield* Effect.forEach(pending, (work) => work);
      expect(logs.join(" ")).toContain("Auth proof-delivery failed");
      expect(logs.join(" ")).not.toContain("private-provider-body-marker");
    }).pipe(Effect.provide([live, Logger.layer([logger])]));
  }),
);

it.effect("does not schedule an unknown commit or resend its recovered receipt", () =>
  Effect.gen(function* () {
    const pending: Effect.Effect<void>[] = [];
    let loseAcknowledgement = true;
    let sends = 0;

    const uncertain = Layer.effect(
      Proofs.ProofPersistence,
      Effect.gen(function* () {
        const store = yield* Proofs.ProofPersistence;

        return Proofs.ProofPersistence.of({
          ...store,
          issue: (request, prepare) =>
            store.issue(request, prepare).pipe(
              Effect.flatMap((receipt) => {
                if (loseAcknowledgement) {
                  loseAcknowledgement = false;

                  return Proofs.ProofUnavailable.make({});
                }

                return Effect.succeed(receipt);
              }),
            ),
        });
      }),
    ).pipe(Layer.provide(authority));

    const live = proofs.handlersLayer.pipe(
      Layer.provide(proofs.smsLayer),
      Layer.provide([
        base,
        uncertain,
        Layer.succeed(Proofs.ProofDispatchScheduler, {
          schedule: (work) =>
            Effect.sync(() => {
              pending.push(work);
            }),
        }),
        Proofs.SmsProofDelivery.layer({ vendorId: "test", idempotencyMillis: 0 }, () =>
          Effect.sync(() => {
            sends++;

            return { _tag: "Accepted" as const };
          }),
        ),
      ]),
    );

    yield* Effect.gen(function* () {
      const request = proofs.operations.Request.invoke(invocation, input("unknown"));

      expect(yield* request.pipe(Effect.flip)).toBeInstanceOf(Proofs.ProofUnavailable);
      expect(pending).toHaveLength(0);
      yield* request;
      yield* Effect.forEach(pending, (work) => work);
      expect(sends).toBe(0);
    }).pipe(Effect.provide(live));
  }),
);
