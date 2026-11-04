import { it } from "@effect/vitest";
import * as Twilio from "@yielded/auth/adapters/Twilio";
import { SmsDelivery } from "@yielded/auth/SmsDelivery";
import * as Deferred from "effect/Deferred";
import * as Effect from "effect/Effect";
import * as Fiber from "effect/Fiber";
import * as HttpClient from "effect/http/HttpClient";
import * as Layer from "effect/Layer";
import * as Redacted from "effect/Redacted";
import * as TestClock from "effect/testing/TestClock";
import { expect } from "vite-plus/test";

const configuration = Layer.succeed(Twilio.TwilioConfig, {
  accountSid: `AC${"0".repeat(32)}`,
  authToken: Redacted.make("test-token"),
  from: "+14155550100",
});

const message = { id: "delivery-1", to: "+14155550123", body: Redacted.make("Code: 123456") };
const send = Effect.flatMap(SmsDelivery, (sms) => sms.send(message));

it.effect("times out ambiguously without repeating a send", () =>
  Effect.gen(function* () {
    let calls = 0;
    let aborted = false;
    const started = yield* Deferred.make<void>();

    const client = HttpClient.make((_request, _url, signal) =>
      Effect.gen(function* () {
        calls++;
        signal.addEventListener(
          "abort",
          () => {
            aborted = true;
          },
          { once: true },
        );
        yield* Deferred.succeed(started, undefined);

        return yield* Effect.never;
      }),
    );

    const live = Twilio.layer.pipe(
      Layer.provide(configuration),
      Layer.provide(Layer.succeed(HttpClient.HttpClient, client)),
    );

    const fiber = yield* send.pipe(Effect.provide(live), Effect.forkChild);

    yield* Deferred.await(started);
    yield* TestClock.adjust("10 seconds");
    expect(yield* Fiber.join(fiber)).toEqual({ _tag: "Ambiguous" });
    expect(calls).toBe(1);
    expect(aborted).toBe(true);
  }),
);
