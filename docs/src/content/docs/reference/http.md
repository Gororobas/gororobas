---
title: HTTP and action contracts
description: Route defaults, cookies, request policy, and explicit action declarations.
---

Start with [HTTP integration](../guide/http-and-client) to compose the server,
and the [Effect Atom client](../guide/client) to call it. Both use the same
`AuthContract`; this page covers the transport details and custom actions.

## Route defaults

- **`requireSession`**: GET `/auth/requireSession`
- **`getSession`**: POST `/auth/getSession`
- **`signIn`, `signOut`, `renewSession`**: POST `/auth/signIn`, `/auth/signOut`, `/auth/renewSession`

No-input queries use GET. Queries with payloads use POST so their inputs stay out
of URLs. Change the shared prefix with `basePath` on `AuthContract.make`; server
and client use the same descriptors.

The HttpApi group defaults to `auth`. To rename it, use the same name in the
shared contract and server handlers:

```ts
// Shared API
AuthContract.httpGroup(AuthApi, { name: "account" });

// Server Layer
http.handlers(Api, { name: "account" });
```

Configure paths through `basePath` rather than prefixing the generated endpoints.

`getSession` accepts `{}` or `{ "payload": { "fresh": true } }` as its JSON body.
The fresh option bypasses the cookie cache; the call remains a read-only query.

## Cookies and request policy

Cookies default to `Secure`, `HttpOnly`, `SameSite=Lax`, path `/`, and the
`__Host-effect-auth-` prefix. Override `cookie.name` for the session slot or
`cookie.prefix` for all slots. Secure custom names and prefixes must begin with
`__Host-` without a cookie domain. `cookie.secure: false` is
allowed only with HTTP loopback origins (`localhost`, `127.0.0.1`, or `[::1]`).
Use your real HTTPS origin; never derive trusted origins from an untrusted request
header. Invalid combinations fail startup.

OAuth callbacks need the request-binding cookie on a cross-site return. Keep
`SameSite=Lax`; configuring OAuth with `cookie.sameSite: "strict"` fails startup.

`cookie.domain` shares every auth cookie with a bare host and its subdomains
(no scheme, port, path, or leading dot). It requires HTTPS, `Secure`, and
`__Secure-` names; the default prefix becomes `__Secure-effect-auth-`.
`__Host-` names fail startup with `OperationHttpConfigurationError`.

`trustedOrigins` adds exact origins alongside `origin` for request admission.
HTTPS origins are supported in every configuration. A host-only HTTP loopback
`origin` with `cookie.secure: false` also admits additional HTTP loopback origins
(`localhost`, `127.0.0.1`, or `[::1]`). An HTTPS primary origin and domain cookies require HTTPS throughout;
with a cookie domain, all origins must be inside it. Wildcards and URL paths are
rejected, and ports must match. Absolute OAuth and email return targets keep their
separate HTTPS allowlist policy.

Native `Http.layer`, `http.routes()`, and `http.handlers(Api)` mount the selected
GET/POST actions. Configure global credentialed CORS for cross-origin clients so
`OPTIONS` reaches middleware before route lookup and errors receive CORS headers.
Allow the exact client origin, credentials, `content-type`, and the configured
CSRF header (`x-effect-auth-csrf` by default). The
[cross-origin example](../guide/http-and-client#browser-clients-on-another-origin)
shows the `HttpRouter.cors` composition. The lower-level
`OperationHttpServer.handle` has its own preflight handling.

Use domain cookies only when you trust every subdomain to receive and set them.
See [shared-session setup and security](../guide/http-and-client#sharing-sessions-across-apps).

POST auth actions require an admitted Origin, JSON content type, and
`x-effect-auth-csrf: 1` by default. GET actions have no body or CSRF header and
reject an explicitly untrusted Origin. Duplicate authority credentials are rejected;
invalid or duplicate optional cache cookies are ignored. Session responses are
not cacheable. If you override `csrf` on the server,
pass matching settings to `Client.make`.

Named mutations enforce Origin and CSRF before side effects, including local
calls from application routes. Raw strategy methods are treated as mutations.
For a custom credential-producing workflow, call `http.protect(effect)` inside
the request boundary; it applies mutation policy and supplies private collectors
without imposing a body format. Custom hosts still own webhook validation and
ordinary application mutation policy.

### Session cache cookies

Enable caching with [`Sessions.stateful({ cacheFor })`](../guide/sessions#cache-ordinary-session-reads).
Both cookies follow the configured auth cookie policy:

- **`session-cache`**: Signed public snapshot bound to the credential and browser generation; expires within `cacheFor` and the session lifetime.
- **`${sessionCacheCookieName}-generation`**: HttpOnly mutation generation; lasts `maximumIssuedAge`.

Caching starts through authoritative session reads without requiring another
sign-in. The HTTP response must be able to set cookies; anonymous reads do not
initialize caching, and disabling it sends no cache cookies.

Admitted mutations clear the snapshot. Other clients and lost responses retain
the bounded `cacheFor` revocation delay. Do not use cached public claims as private
authentication evidence.

Snapshot values are capped at `min(maximumTokenBytes, 3072)` bytes; the complete
serialized cookie, including name and attributes, must fit 4,096 bytes. Oversize,
encoding, and backend failures report sanitized diagnostics and fall back to
authoritative reads. Invalid, expired, or duplicate snapshots fall back silently.

## Proof request rate limits

Auth supplies `Proofs.HostIngressLimiter` for email code/link and password-reset
requests. The default network bucket holds twenty requests and replenishes one
every three minutes, shared across purposes and device keys. Every request is
checked before target lookup, including retries and suppressed requests.
Durable delivery quotas separately count only issued proofs.

Configure the bucket when building Auth:

```ts
import { Proofs } from "@yielded/auth";
import { Layer } from "effect";

const AuthLive = AppAuth.layer.pipe(
  Layer.provide(Proofs.HostIngressLimiter.layer({ limit: 40, windowMillis: 3_600_000 })),
);
```

Both options must be positive integers. The default store is process-local, resets
when it is recreated, and holds at most 10,000 network keys. At capacity it evicts the
least recently checked key, which later starts with a full bucket. For
shared enforcement across servers or per-request runtimes, provide an Effect
`RateLimiterStore` to the Auth Layer, such as
[`keyValueRateLimiterStore`](../guide/passwords#share-rate-limits) or
`RateLimiter.layerStoreRedis({ prefix: "auth:requests" })`.
An explicitly provided `RateLimiter` or `HostIngressLimiter` also replaces its
default. Limit malformed traffic at the host before HTTP/RPC parsing.

`Http.layer`, generated routes, and `http.middleware` derive
`Proofs.ProofRequestContext` from the current socket peer. They ignore `Forwarded`
and `X-Forwarded-For`. For a trusted proxy or a host without socket metadata,
provide the verified client identity around each request:

```ts
handler.pipe(
  Effect.provideService(
    Proofs.ProofRequestContext,
    Effect.succeed({ networkKey: Redacted.make(trustedClientAddress) }),
  ),
);
```

The resolver runs only when an operation needs proof admission. Without a peer or
override, code/reset requests fail as unavailable; unrelated routes still work.
Never derive this identity from operation payloads or install one caller in a
shared Auth Layer. Raw `OperationHttpServer.handle` and non-HTTP calls require
this per-invocation service explicitly.

## Declare an action

The method guides show the available local strategy calls. Browser access requires
an action in `AuthApi`: `AuthContract.passwordSignIn` is the password shortcut;
`AuthContract.fromOperation` reuses a pure operation contract; `AuthContract.action`
accepts explicit payload, success, and error schemas.

Each action selects a server `method` and, when needed, a `strategy`. The method
defaults to the action's name. You can expose two strategies under different names
without making the client choose a strategy string. Configure only actions your
application intends to serve. Password and OAuth have shared action helpers;
passkey and TOTP have dedicated pure contract modules. Email and phone flows
require explicit action schemas.

Map private method inputs through `requestFields` when declaring an action:

| Method input                                                         | Credential slot   |
| -------------------------------------------------------------------- | ----------------- |
| Email, phone, or OAuth `requestBinding`; passkey `bindingCredential` | `request-binding` |
| TOTP `pendingCredential`                                             | `pending-proof`   |

The server injects those values from `Auth.AuthRequest`; both named local calls and
remote payloads omit them. Set `credentials: true` for actions that issue or clear
credentials, declare any private reveals, and supply a `subject.fromSuccess`
projection for actions that establish or replace the authenticated account.
`fromOperation` carries forward the operation's schemas, replay policy, credential
delivery, and reveal declarations; the subject projection remains explicit.

See the [passkey contract](../guide/passkeys#define-the-shared-actions) for a complete
example and [TOTP](../guide/totp#expose-private-reveals-over-http) for private reveals.

## Diagnostics

Auth emits fixed `stage` and `reason` fields at Effect's `Debug` level for session,
persistence, and OAuth failures. Unexpected failures retain sanitized `Error` logs;
public errors stay redacted. Enable diagnostics in your server's request context:

```ts
import { Layer, Logger, References } from "effect";

const DiagnosticsLive = Layer.mergeAll(
  Logger.layer([Logger.consoleJson]),
  Layer.succeed(References.MinimumLogLevel, "Debug"),
);
const ServerLive = Routes.pipe(Layer.provideMerge(DiagnosticsLive));
```

With `HttpRouter.toWebHandler`, expose logging and tracing configuration in the
built Layer's output as above, or pass it in the handler's request `Context`.
Auth logs and spans use that invocation context. Failed persistence initialization
stays cached until its owning Layer is reacquired.

Auth's diagnostic payloads exclude credentials and raw causes. Your application
owns redaction of its annotations, span names, and logger output. Keep HTTP headers,
bodies, OAuth URL queries, and SQL parameters out of logs and traces.

## Lower-level transports

`http.withRequest` wraps a custom Effect returning `HttpServerResponse`.
Raw strategy calls retain mutation admission, including inside GET handlers;
declare a named query action to expose a read.
`http.operationLayer` supplies browser policy, caller resolution and configured
session-cache invalidation to existing `OperationHttpServer` contracts. Those
descriptors continue to own private payload injection and explicitly selected reveals.
Encode expected response failures before leaving the request wrapper.

`OperationHttpServer.make` retains configuration and caller resolution. Supply
operation handlers, codec services, and callback response services when running
`server.handle(request)`. Shared `Http` routes bind their auth API and expose other
invocation services as `HttpRouter.Request` requirements for host middleware.
Keep trusted caller context in that middleware; never install one caller in a
shared application Layer. See the
[lower-level server example](https://github.com/yielded-dev/auth/blob/main/examples/auth/src/transport-application.ts).

`OperationHttpClient.make` requires the same Effect `HttpClient` service.
`OperationHttpClient.layer(options)` provides `OperationHttpClient.Client` for
consumers such as `AuthAtom.makeLifetime({ initialSubject })`. Supply this Layer
at the application boundary and keep the lifetime's Scope open until the host
finishes. The lifetime acquires its transport from the service environment.
`AuthAtom.query`, `AuthAtom.mutation`, and `AuthAtom.workflow` remain available for
custom integration. Private reveals belong in a finite
collector, outside ordinary query caches, logs, and persisted client state.
