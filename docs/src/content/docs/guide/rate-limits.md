---
title: Rate limiting
description: Choose a rate-limit backend and connect Cloudflare's native limiter through Alchemy.
---

Auth provides rate limits by default. Supply Effect's `RateLimiter` service or
`RateLimiterStore` when your application needs limits shared across runtimes.
The backend belongs to your application; Auth does not select a cloud provider.

## Defaults and overrides

Default limiters keep token buckets in memory, bounded to 10,000 keys. Restarting
or rebuilding Auth resets them; exhausting capacity can reject legitimate attempts.
Multiple replicas and per-request runtimes need a shared backend for identifier,
subject, target, and network limits.

Provide `RateLimiter.RateLimiter` to Auth for a custom admission check, or
`RateLimiter.RateLimiterStore` to retain Effect's algorithms with different storage.
When both are provided, Auth uses the limiter service. Supply the override before
building `AppAuth.layer` or `http.layer`.

Action, global message, and passkey module budgets remain local to each Auth
instance. Rebuilding Auth per request also resets these local budgets; use host
or edge controls when you need an aggregate request limit. Rejected attempts
still count, and backend failures deny requests.

## Cloudflare Workers with Alchemy

Cloudflare's [native rate-limit binding](https://developers.cloudflare.com/workers/runtime-apis/bindings/rate-limit/)
uses counters cached on the machine running the Worker. Await its decision before
continuing authentication; a check does not wait for a storage network request.
Limits are approximate and local to each Cloudflare location, so choose this
backend when that accuracy fits your application.

This recipe uses Alchemy's Effect-native client for the default password sign-in
identifier and subject budgets: ten attempts per minute. It also fits the default
passkey subject and target budgets. Start with the sign-in-only
[HTTP composition](./http-and-client#configure-the-server).

### Adapt the binding

Cloudflare fixes the budget on the binding and returns only an admission decision.
The adapter below accepts Auth's one-token, ten-per-minute checks and rejects
other configurations. It replaces token-bucket accounting with Cloudflare's
approximate policy; it is not a general-purpose Effect limiter.

```ts title="apps/server/rate-limits.ts"
import * as Cloudflare from "alchemy/Cloudflare";
import { RuntimeContext } from "alchemy/RuntimeContext";
import { Crypto, Duration, Effect, Layer } from "effect";
import { Base64Url } from "effect/encoding";
import { RateLimiter } from "effect/persistence";

const authRateLimitConfig = { limit: 10, period: 60 } as const;

export const AuthRateLimit = Cloudflare.RateLimit("AUTH_RATE_LIMITS", {
  namespaceId: 1001,
  simple: authRateLimitConfig,
});

const unavailable = (cause: unknown) =>
  RateLimiter.RateLimiterError.make({
    reason: RateLimiter.RateLimitStoreError.make({
      message: "Auth rate-limit check unavailable",
      cause,
    }),
  });

export const AuthRateLimitsLive = Layer.effect(
  RateLimiter.RateLimiter,
  Effect.gen(function* () {
    const native = yield* AuthRateLimit;
    const runtime = yield* RuntimeContext;
    const crypto = yield* Crypto.Crypto;
    const window = Duration.seconds(authRateLimitConfig.period);
    const unsupported = Effect.fail(
      unavailable("Expected one token, ten attempts per minute, and fail on excess"),
    );

    return RateLimiter.RateLimiter.of({
      [RateLimiter.TypeId]: RateLimiter.TypeId,
      adaptiveConsume: () => unsupported,
      adaptiveFeedback: () => unsupported,
      consume: Effect.fn("AuthRateLimits.consume")(function* (request) {
        if (
          request.algorithm !== "token-bucket" ||
          (request.tokens ?? 1) !== 1 ||
          (request.onExceeded ?? "fail") !== "fail" ||
          request.limit !== authRateLimitConfig.limit ||
          Duration.toMillis(Duration.fromInputUnsafe(request.window)) !== Duration.toMillis(window)
        ) {
          return yield* unsupported;
        }

        const digest = yield* crypto
          .digest("SHA-256", new TextEncoder().encode(request.key))
          .pipe(Effect.mapError(unavailable));
        const { success } = yield* native
          .limit({ key: Base64Url.encode(digest) })
          .pipe(Effect.provideService(RuntimeContext, runtime), Effect.mapError(unavailable));

        if (!success) {
          return yield* RateLimiter.RateLimiterError.make({
            reason: RateLimiter.RateLimitExceeded.make({
              key: request.key,
              retryAfter: window,
              limit: request.limit,
              remaining: 0,
            }),
          });
        }

        return { delay: Duration.zero, limit: request.limit, remaining: 0, resetAfter: window };
      }),
    });
  }),
);
```

Hash the complete Auth key to retain its module, action, and identity separation
without sending raw identifiers to the binding. A denial becomes
`RateLimitExceeded`; a binding or digest failure retains its cause in
`RateLimitStoreError`. Auth translates those into the method's rejection or
availability error.

Auth uses only success or failure from this adapter. Cloudflare supplies no
remaining-token count or reset time, so the returned metadata uses conservative
placeholders. Do not use it for quota displays, rate-limit headers, or delayed retries.

### Bind and provide it per request

Declare the binding on your Alchemy Worker's `env`, then build Auth inside `fetch`
so the adapter acquires the client and captures the current request's `RuntimeContext`.
`AuthRateLimitsLive` requires Alchemy's `RateLimit` service; provide its implementation
at the Worker boundary.

```ts title="apps/server/worker.ts"
import * as Cloudflare from "alchemy/Cloudflare";
import { Effect, Layer } from "effect";
import { Etag, HttpPlatform, HttpRouter } from "effect/http";

import { http } from "./auth";
import { AuthDependencies } from "./auth-dependencies";
import { AuthRateLimit, AuthRateLimitsLive } from "./rate-limits";

const Routes = http
  .routes()
  .pipe(
    Layer.provide(http.layer),
    Layer.provide(AuthRateLimitsLive),
    Layer.provide(Cloudflare.Workers.RateLimitBinding),
    Layer.provide(AuthDependencies),
    Layer.provide(HttpPlatform.layer),
    Layer.provide(Etag.layerWeak),
  );

export default Cloudflare.Worker(
  "AuthWorker",
  {
    main: import.meta.url,
    compatibility: { flags: ["nodejs_compat"] },
    env: { AUTH_RATE_LIMITS: AuthRateLimit },
  },
  Effect.succeed({
    fetch: Effect.gen(function* () {
      const handle = yield* HttpRouter.toHttpEffect(Routes).pipe(Effect.orDie);

      return yield* handle;
    }).pipe(Effect.scoped),
  }),
);
```

The relative imports are your application's existing Auth definition and services.
`AuthDependencies` includes password hashing, persistence, claims, session services,
and `Crypto.Crypto`; see [service composition](../reference/adapters#compose-the-application-layer).
Build the default-exported Worker from your Alchemy stack. The `env` declaration
attaches the binding, and `RateLimitBinding` supplies its Effect implementation.
Keep the default export: Alchemy's runtime entrypoint imports it from `main`.

Choose a stable namespace ID for this application and environment. Bindings with
the same ID share counters for a key, including across Workers in the same account.
Keep the Layer description outside `fetch` if useful, but build it per request as
shown. Do not cache the built Auth service or the captured `RuntimeContext` across
requests. The request scope closes after the handler finishes.

### Other budgets and methods

Cloudflare supports periods of 10 or 60 seconds. Additional supported budgets need
separate bindings and adapter routing by budget. Keep Auth's policy and the binding
configuration aligned.

This ten-per-minute adapter does not support every Auth method's defaults. For
example, proof-request network admission defaults to twenty requests per hour.
Before enabling email codes or password recovery, supply a backend that supports
their [network](../reference/http#proof-request-rate-limits) and
[delivery](./codes#proof-expiry-and-rate-limits) budgets. Unsupported checks fail
closed; they do not fall back to memory. Proof delivery also needs a scope that
outlives queued work; follow the [email delivery lifecycle](./email-delivery#compose-auth).

## Other shared stores

For an Effect `KeyValueStore`, provide Auth's store adapter with your crypto Layer:

```ts title="apps/server/rate-limits.ts"
import { Layer } from "effect";
import { Persistence } from "@yielded/auth";

import { CryptoLive } from "./crypto-live";
import { KeyValueStoreLive } from "./rate-limit-store";

export const RateLimitsLive = Persistence.keyValueRateLimiterStore.pipe(
  Layer.provide(KeyValueStoreLive),
  Layer.provide(CryptoLive),
);
```

Provide `RateLimitsLive` to `AppAuth.layer` or `http.layer`. Keep entries for at
least the longest configured window. Each check awaits a read and a write on the
authentication path, so storage latency matters. Checks are non-atomic:
concurrent requests and replication lag can exceed the limit. Read or write
failures deny requests. For atomic shared accounting, use an Effect store such as
`RateLimiter.layerStoreRedis()`.
