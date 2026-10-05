import { it } from "@effect/vitest";
import { Auth, Email, Password, Proofs, Sessions } from "@yielded/auth";
import { Effect, Layer, Redacted, Schema } from "effect";
import { RateLimiter } from "effect/persistence";
import { TestClock } from "effect/testing";
import { expect } from "vite-plus/test";

export const app = Auth.make("test/proof-ingress", {
  claims: Schema.Struct({}),
  sessions: Sessions.stateful(),
  defaultStrategy: "email",
  strategies: {
    email: Email.makeCode(),
    password: Password.make({
      registration: Schema.Struct({}),
      reset: Password.resetLink({ url: "https://example.test/reset" }),
    }),
  },
});

const request = {
  flowId: "flow",
  requestBinding: "binding",
  requestId: "request",
  email: "person@example.test",
  returnTarget: "/",
  locale: "en",
};

const guest = { _tag: "Guest" } as const;

// Requested security regression: ingress must reject before a proof-request
// handler can perform target lookup or persistence, using each invocation's keys.
it.effect("authorizes email requests and resends with the current trusted network context", () =>
  Effect.gen(function* () {
    const { Request, Resend } = app.strategies.email.operations;
    const seen: Array<{ action: string; network: string; device: string | undefined }> = [];
    let entered = 0;

    const handler = Effect.sync(() => {
      entered++;
    }).pipe(Effect.andThen(Effect.fail(Email.EmailUnavailable.make({}))));

    const handlers = yield* Layer.build(
      Layer.merge(
        Request.handlerLayer(() => handler),
        Resend.handlerLayer(() => handler),
      ),
    );

    const limiter = Proofs.HostIngressLimiter.of({
      check: (input) =>
        Effect.gen(function* () {
          const network = Redacted.value(input.networkKey);

          seen.push({
            action: input.action,
            network,
            device: input.deviceKey === undefined ? undefined : Redacted.value(input.deviceKey),
          });
          if (network === "blocked") return yield* Proofs.ProofIngressDenied.make({});
        }),
    });

    const denied = yield* Request.invoke(guest, request).pipe(
      Effect.provide(handlers),
      Effect.provideService(Proofs.HostIngressLimiter, limiter),
      Effect.provideService(
        Proofs.ProofRequestContext,
        Effect.succeed({ networkKey: Redacted.make("blocked") }),
      ),
      Effect.result,
    );

    const afterDenied = entered;

    const admitted = yield* Request.invoke(guest, request).pipe(
      Effect.provide(handlers),
      Effect.provideService(Proofs.HostIngressLimiter, limiter),
      Effect.provideService(
        Proofs.ProofRequestContext,
        Effect.succeed({
          networkKey: Redacted.make("allowed"),
          deviceKey: Redacted.make("trusted-device"),
        }),
      ),
      Effect.result,
    );

    const resent = yield* Resend.invoke(guest, { ...request, supersedes: "previous" }).pipe(
      Effect.provide(handlers),
      Effect.provideService(Proofs.HostIngressLimiter, limiter),
      Effect.provideService(
        Proofs.ProofRequestContext,
        Effect.succeed({ networkKey: Redacted.make("blocked") }),
      ),
      Effect.result,
    );

    expect(denied).toMatchObject({ _tag: "Failure", failure: { _tag: "EmailRejected" } });
    expect(afterDenied).toBe(0);
    expect(admitted).toMatchObject({ _tag: "Failure", failure: { _tag: "EmailUnavailable" } });
    expect(resent).toMatchObject({ _tag: "Failure", failure: { _tag: "EmailRejected" } });
    expect(entered).toBe(1);
    expect(seen).toEqual([
      { action: "test/proof-ingress/email/code/sign-in", network: "blocked", device: undefined },
      {
        action: "test/proof-ingress/email/code/sign-in",
        network: "allowed",
        device: "trusted-device",
      },
      { action: "test/proof-ingress/email/code/sign-in", network: "blocked", device: undefined },
    ]);
  }).pipe(Effect.scoped),
);

it.effect(
  "rejects password reset ingress before its handler and fails closed on limiter outage",
  () =>
    Effect.gen(function* () {
      const { RequestReset } = app.strategies.password.operations;
      let entered = 0;
      const seen: string[] = [];

      const handlers = yield* Layer.build(
        RequestReset.handlerLayer(() =>
          Effect.sync(() => {
            entered++;
          }).pipe(Effect.andThen(Effect.fail(Password.PasswordUnavailable.make({})))),
        ),
      );

      const limiter = Proofs.HostIngressLimiter.of({
        check: ({ networkKey }) =>
          Effect.gen(function* () {
            const network = Redacted.value(networkKey);

            seen.push(network);

            return yield* network === "blocked"
              ? Proofs.ProofIngressDenied.make({})
              : Proofs.ProofUnavailable.make({});
          }),
      });

      const denied = yield* RequestReset.invoke(guest, request).pipe(
        Effect.provide(handlers),
        Effect.provideService(Proofs.HostIngressLimiter, limiter),
        Effect.provideService(
          Proofs.ProofRequestContext,
          Effect.succeed({ networkKey: Redacted.make("blocked") }),
        ),
        Effect.result,
      );

      const unavailable = yield* RequestReset.invoke(guest, request).pipe(
        Effect.provide(handlers),
        Effect.provideService(Proofs.HostIngressLimiter, limiter),
        Effect.provideService(
          Proofs.ProofRequestContext,
          Effect.succeed({ networkKey: Redacted.make("outage") }),
        ),
        Effect.result,
      );

      expect(denied).toMatchObject({ _tag: "Failure", failure: { _tag: "PasswordRejected" } });
      expect(unavailable).toMatchObject({
        _tag: "Failure",
        failure: { _tag: "PasswordUnavailable" },
      });
      expect(entered).toBe(0);
      expect(seen).toEqual(["blocked", "outage"]);
    }).pipe(Effect.scoped),
);

// Requested configurable defaults: separately built limiters must honor a supplied
// shared store; changing purpose or device cannot create another network allowance.
it.effect("shares a configured network allowance through the supplied store and refills it", () =>
  Effect.gen(function* () {
    const store = yield* Layer.build(RateLimiter.layerStoreMemory);

    const check = (network: string, action: string, device: string) =>
      Effect.flatMap(Proofs.HostIngressLimiter, (limiter) =>
        limiter.check({
          action,
          networkKey: Redacted.make(network),
          deviceKey: Redacted.make(device),
        }),
      ).pipe(
        Effect.provide(
          Proofs.HostIngressLimiter.layer({ limit: 2, windowMillis: 1000 }).pipe(
            Layer.provide(Layer.succeedContext(store)),
          ),
        ),
        Effect.result,
      );

    expect(yield* check("caller", "email", "first")).toMatchObject({ _tag: "Success" });
    expect(yield* check("caller", "reset", "second")).toMatchObject({ _tag: "Success" });
    expect(yield* check("caller", "email", "third")).toMatchObject({
      _tag: "Failure",
      failure: { _tag: "ProofIngressDenied" },
    });
    expect(yield* check("another-caller", "reset", "first")).toMatchObject({ _tag: "Success" });
    yield* TestClock.adjust("500 millis");
    expect(yield* check("caller", "reset", "fourth")).toMatchObject({ _tag: "Success" });
  }).pipe(Effect.scoped),
);
