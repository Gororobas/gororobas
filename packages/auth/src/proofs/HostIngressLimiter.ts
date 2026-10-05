import { Context, Duration, Effect, Layer, Redacted, Schema } from "effect";
import * as RateLimiter from "effect/persistence/RateLimiter";

import { defaultLayer } from "../auth/defaults";
import { ProofConfigurationError, ProofIngressDenied, ProofUnavailable } from "./errors";
import { ProofBudget } from "./policy";

const rateLimiterLayer = defaultLayer(
  RateLimiter.RateLimiter,
  RateLimiter.layer.pipe(
    Layer.provide(defaultLayer(RateLimiter.RateLimiterStore, RateLimiter.layerStoreMemory)),
  ),
);

/**
 * Admission before target lookup for every email proof and password reset request.
 * Auth supplies the default Layer; provide this service to replace its policy.
 * Trusted per-request network/device keys come from ProofRequestContext, never payloads.
 */
export class HostIngressLimiter extends Context.Service<
  HostIngressLimiter,
  {
    readonly check: (input: {
      readonly action: string;
      readonly networkKey: Redacted.Redacted<string>;
      readonly deviceKey?: Redacted.Redacted<string>;
    }) => Effect.Effect<void, ProofIngressDenied | ProofUnavailable>;
  }
>()("effect-auth/HostIngressLimiter") {
  /** A shared network bucket with capacity 20, refilling over one hour by default.
   * Uses a supplied Effect RateLimiter or RateLimiterStore when present. Otherwise,
   * counters are process-local and keys remain in memory for the runtime's lifetime.
   * Supply a shared store for coordination across servers. Hosts separately limit
   * malformed traffic before HTTP/RPC parsing.
   */
  static readonly layer = (options: Partial<ProofBudget> = {}) =>
    Layer.effect(
      this,
      Effect.gen(function* () {
        const policy = yield* Schema.decodeEffect(ProofBudget)({
          limit: options.limit ?? 20,
          windowMillis: options.windowMillis ?? 3_600_000,
        }).pipe(Effect.mapError(() => ProofConfigurationError.make({ reason: "policy" })));

        const limiter = yield* RateLimiter.RateLimiter;

        return HostIngressLimiter.of({
          check: ({ networkKey }) =>
            limiter
              .consume({
                key: `effect-auth:proof-network:${Redacted.value(networkKey)}`,
                algorithm: "token-bucket",
                limit: policy.limit,
                window: Duration.millis(policy.windowMillis),
                onExceeded: "fail",
              })
              .pipe(
                Effect.asVoid,
                Effect.mapError((error) =>
                  error.reason._tag === "RateLimitExceeded"
                    ? ProofIngressDenied.make({})
                    : ProofUnavailable.make({}),
                ),
              ),
        });
      }),
    ).pipe(Layer.provide(rateLimiterLayer));
}

// Reuse one Layer identity so all built-in strategies share the same allowance.
export const defaultIngressLayer = defaultLayer(HostIngressLimiter, HostIngressLimiter.layer());
