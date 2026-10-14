import { Context, Duration, Effect, Layer, Schema } from "effect";
import * as RateLimiter from "effect/persistence/RateLimiter";

import { defaultLayer } from "../auth/defaults";
import { boundedMemoryRateLimiter, localRateLimiter } from "../auth/rateLimiter";
import { PhoneAdmissionPolicy, PhoneConfigurationError } from "./lifecycleModels";
import { PhoneOtpUnavailable } from "./models";

export const defaultPhoneAdmissionPolicy: PhoneAdmissionPolicy = {
  windowMillis: 60_000,
  networkRequests: 10,
  networkAttempts: 100,
  maximumMessages: 10,
};

/** Charge every network request/attempt and each request's global message budget,
 * including suppressed recipients. No replay receipts or refunds. Defaults use
 * bounded process-local token buckets that retain active entries and fail closed
 * at capacity; supply a shared RateLimiterStore across replicas. The global message
 * budget is always process-local. */
export class PhoneAdmission extends Context.Service<
  PhoneAdmission,
  {
    readonly admit: (input: {
      readonly moduleId: string;
      readonly action: "request" | "attempt";
      readonly networkKey: string;
    }) => Effect.Effect<boolean, PhoneOtpUnavailable>;
  }
>()("effect-auth/PhoneAdmission") {
  static readonly layer = (options: PhoneAdmissionPolicy = defaultPhoneAdmissionPolicy) =>
    Layer.effect(
      this,
      Effect.gen(function* () {
        const policy = yield* Schema.decodeEffect(PhoneAdmissionPolicy)(options).pipe(
          Effect.mapError(() => PhoneConfigurationError.make({})),
        );

        const shared = yield* RateLimiter.RateLimiter;
        const local = yield* localRateLimiter("reject");

        const consume = (
          bucket: "network" | "messages",
          key: ReadonlyArray<string>,
          limit: number,
        ) =>
          (bucket === "messages" ? local : shared).consume({
            key: JSON.stringify(["effect-auth/phone", ...key]),
            algorithm: "token-bucket",
            limit,
            window: Duration.millis(policy.windowMillis),
            onExceeded: "fail",
          });

        return PhoneAdmission.of({
          admit: ({ moduleId, action, networkKey }) =>
            Effect.gen(function* () {
              yield* consume(
                "network",
                [moduleId, "network", action, networkKey],
                action === "request" ? policy.networkRequests : policy.networkAttempts,
              );
              if (action === "request")
                yield* consume("messages", [moduleId, "messages"], policy.maximumMessages);

              return true;
            }).pipe(
              Effect.catch((error) =>
                error.reason._tag === "RateLimitExceeded"
                  ? Effect.succeed(false)
                  : Effect.fail(PhoneOtpUnavailable.make({})),
              ),
            ),
        });
      }),
    ).pipe(Layer.provide(boundedMemoryRateLimiter("reject")));
}

export const defaultPhoneAdmissionLayer = defaultLayer(PhoneAdmission, PhoneAdmission.layer());
