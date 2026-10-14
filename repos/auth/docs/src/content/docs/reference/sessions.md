---
title: Sessions
description: Session options, application secrets, and custom Layer composition.
---

Start with the [sessions guide](../guide/sessions) for setup and request methods.

## Lifetimes

Pass these options to `Sessions.stateful()`, `stateless()`, or `stateAssisted()`.
Durations accept Effect duration inputs such as `"30 minutes"`.

| Option               | Default and behavior                                                                          |
| -------------------- | --------------------------------------------------------------------------------------------- |
| `maxAge`             | Absolute lifetime: 30 days for stateful/state-assisted; 15 minutes for stateless.             |
| `idleTimeout`        | Shorter of 7 days and `maxAge`. Renewal extends idle expiry within the absolute lifetime.     |
| `renewAfter`         | Shorter of 1 day and half `idleTimeout`. Reads never renew implicitly.                        |
| `maximumIssuedAge`   | `maxAge`; maximum accepted lifetime of previously issued tokens.                              |
| `issuer`, `audience` | Stable session namespace derived from the Auth definition.                                    |
| `generation`         | `1`; changing it invalidates signed tokens and cached snapshots.                              |
| `maximumTokenBytes`  | 4,096; accepts 256–1,048,576 bytes.                                                           |
| `cacheFor`           | Stateful only; disabled by default or `0`. At most the shorter of 5 minutes and `renewAfter`. |

Lifetimes must satisfy `renewAfter < idleTimeout <= maxAge <= maximumIssuedAge`.
When shortening `maxAge`, retain the previous `maximumIssuedAge` until older tokens
expire if they should remain valid.

Caching is incompatible with `requireImmediateInvalidation: true` on an
authentication feature; TOTP enables that policy by default. Invalidation results
report `existingSessions: "cache-expiry"` and the configured `maximumExposureMillis`
when ordinary reads may still use a snapshot. See [cookie limits](./http#session-cache-cookies).

## Independent clocks

Configure one shared future-clock tolerance when Auth and SQL use independent
clocks. The default is `0`; `futureToleranceMillis` accepts integers from 0 to 60,000.

```ts
import { Layer } from "effect";
import { Operations } from "@yielded/auth";

const ClockPolicyLive = Operations.AuthenticationClock.layer({
  futureToleranceMillis: 1_000,
});
const Live = AuthLive.pipe(Layer.provideMerge(ClockPolicyLive));
```

Compose Auth and persistence before providing this Layer. Independently acquired
adapters and protected-action services need the same policy. The allowance applies
to future timestamps; expiry and freshness limits stay strict. Keep clocks within
your configured bound. See [adapter configuration](./adapters#sql-session-verification).

## Signing keys

- **`Auth.AuthConfig`**: `AuthConfig.layer()` reads `AUTH_SECRET` through Effect Config. Provide `AuthConfig.layer({ secret })` with a `Redacted<string>` to use your own secret store.
- **`Sessions.SessionSigningKeys`**: Derived from `AuthConfig`; provide a keyring service for rotation. An explicit keyring bypasses the application-secret lookup.

Missing secrets or values shorter than 32 characters fail startup with
`AuthConfigurationError`. There is no generated fallback. Keep the same secret
across instances and restarts; changing it invalidates its signed tokens and
cached snapshots.

To rotate keys, supply a `SessionSigningKeyring`:

```ts
import { Layer } from "effect";
import { Sessions } from "@yielded/auth";

const SigningKeysLive = Layer.succeed(Sessions.SessionSigningKeys, {
  activeKeyId: "next",
  keys: [
    { id: "next", material: nextKey },
    { id: "default", material: previousKey },
  ],
});
```

Each `material` is redacted base64url containing at least 32 bytes. When replacing
the default service, `previousKey` is the base64url encoding of the application
secret's UTF-8 bytes. Distribute the keyring to every instance and retain old keys
until their tokens expire. The [crypto reference](./crypto#use-with-auth) shows
platform Layers.

## Custom composition

Without `sessions` on `Auth.make`, provide the bound `statefulLayer(policy)`,
`statelessLayer(policy)`, `stateAssistedLayer(policy)`, or your own `SessionStrategy`.
Signed Layers use the same default signing service. Configure cookie caching on
`Auth.make` with `Sessions.stateful({ cacheFor })`.

`completionLayer({ pendingLifetimeMillis, attemptLimit })` supports additional
factors through `PendingAuthentication` persistence. Your `AuthenticationAuthority`
sets the required factors and approves current authority before session issuance.
A pending proof is not a session; see [TOTP setup](../guide/totp#enable-the-authenticator).

`SessionStrategy.inspect` returns a private `SessionSource` containing `inspection`
and a strategy-specific `guard`. Use
`sessions.inspectInvocation(invocation, credential)` in an action policy to obtain
the source that admitted that action. Outside the invocation it inspects afresh.
Public session results and cookie snapshots are not substitutes for this evidence.

Provide the module's `SessionCleanup` service to use `sessions.cleanup({ limit })`.
`limit` is 1–1,000 across expired pending proofs and due assisted revocation
tombstones. The result is `{ removed, hasMore }`; `hasMore` means the limit was
reached, so the next call can remove zero rows. Without maintenance support,
cleanup fails with `SessionCapabilityUnsupported`.
