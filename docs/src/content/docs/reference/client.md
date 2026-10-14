---
title: Client and Atom
description: Transport configuration, Atom options, and account lifetime.
---

Start with the [Effect Atom client guide](../guide/client)
for Atom, React, and HttpClient examples. `Client.make` defines a service;
`AuthAtom.make` defines atoms. Neither acquires resources until used.

## Transport

- **`AuthAtom.make(AppClient)`**: Transport: Configured Fetch via `layerFetch`. Lifetime owner: Application Atom registry.
- **`AuthAtom.make(AppClient, { layer })`**: Transport: Supplied client service Layer. Lifetime owner: Application Atom registry.
- **`AppClient.layerFetch`**: Transport: Configured Fetch. Lifetime owner: Application Scope.
- **`AppClient.layer`**: Transport: Requires `HttpClient.HttpClient`. Lifetime owner: Application Scope.
- **`AppClient.make`**: Transport: Requires `HttpClient.HttpClient`. Lifetime owner: Caller-provided Scope.

Effect HttpClient owns execution, cancellation, tracing, and response resources.
Auth owns credential settlement, CSRF, and bounded envelope decoding. A plain
`HttpApiClient` does not supply private reveal handling or account coordination.

Supplied transports must disable retries, redirect following, and status filtering.
Auth decodes expected failures from their response envelopes. Writes settle in
order within one client instance; reads can run concurrently. Account changes
wait for admitted writes, including requests delayed by middleware.

### Fetch defaults

`layerFetch` uses `credentials: "include"` (`"omit"` in native mode) and
`redirect: "error"`. Other `FetchHttpClient.RequestInit` construction defaults
are preserved. Supply a custom Fetch implementation when constructing the Layer:

```ts
import { Layer } from "effect";
import { FetchHttpClient } from "effect/http";

import { AppClient } from "./auth-client";
import { customFetch } from "./fetch";

export const ClientLive = AppClient.layerFetch.pipe(
  Layer.provide(Layer.succeed(FetchHttpClient.Fetch, customFetch)),
);
```

An application-supplied HttpClient owns its own credential and redirect settings.
Native exchanges disable standard HTTP tracing and automatic trace-header
propagation to keep custom credential headers private; application redaction
settings remain intact.

## Client options

```ts
export const AppClient = Client.make(AuthApi, {
  baseUrl: "https://app.example.com",
  requestTimeout: "10 seconds",
});
```

- **`baseUrl`**: Required absolute server URL. Paths come from the shared contract.
- **`requestTimeout`**: `"30 seconds"`; a positive, finite Effect duration covering HTTP execution and response consumption.
- **`maximumResponseBytes`**: 1 MiB; may only lower that limit. Decoding requires strict UTF-8.
- **`csrf`**: `{ header: "x-effect-auth-csrf", value: "1" }`; must match the server.
- **`native`**: Optional credential headers plus a `credentials` service key implementing `Client.NativeCredentials`, instead of browser cookies.
- **`privateOutput`**: Optional service key implementing `Client.PrivateOutput`; keep private reveals outside query caches and persisted state.

These keys select application-owned stores. Their services remain required by
`AppClient.make`, `AppClient.layer`, and `AppClient.layerFetch`; provide the stores'
Layers when constructing the client. For example, with a `Reveals` service and its
finite `RevealsLive` Layer:

```ts
const AppClient = Client.make(AuthApi, {
  baseUrl: "https://app.example.com",
  privateOutput: Reveals,
});

const ClientLive = AppClient.layerFetch.pipe(Layer.provide(RevealsLive));
const auth = AuthAtom.make(AppClient, { layer: ClientLive });
```

A deadline fails with `OperationHttpError` reason `"timeout"`. The mutation may
already have committed: reconcile with the server or start a fresh flow, never
retry credential issuance based on timeout alone. Uninterruptible application
middleware and finalizers must terminate for cleanup to finish.

## Atom options

`AuthAtom.make(AppClient, options)` exposes named queries and mutations. No-input
queries are atoms; payload-bearing queries are atom families, including optional
payloads. Define object-input queries outside React renders or use stable
Effect `Equal`/`Hash` keys. Queries expose `AsyncResult`, including setup failures.
Write an input to execute a mutation; refreshing its result does not repeat it.

`auth.session` is the default `auth.getSession()` atom. Use
`auth.getSession({ fresh: true })` to bypass the server cookie cache on each fetch.
Custom contracts must expose a `getSession` query accepting no input; `session`,
`runtime`, and `client` are reserved aliases.

- **`runtime`**: Application runtime factory for shared Layers and invalidation; defaults to `Atom.runtime`.
- **`reactivityKeys`**: Additional keys invalidated by each successful named mutation.
- **`services`**: Decoder service Layer; required by the types when response codecs need services.
- **`layer`**: Client service Layer with its dependencies provided; required for configured stores, otherwise defaults to `AppClient.layerFetch`.
- **`initialSession`**: Encoded public session for request-local server rendering.

## Account lifetime

`auth.runtime` shares the atoms' client. It owns queries, workflows, and state
read or written inside them. An account change disposes that account's registry
before publishing its replacement. Atoms outside this runtime keep their own
lifetime; invalidation does not make them account-scoped.

Named queries that discover the account, including `getSession`, `requireSession`,
and custom queries with a subject projection, survive their own account transition
without repeating the request. Unrelated account changes clear their results and
start a new read. Explicit refreshes request the session again, including when an
SSR seed was supplied.

Named auth mutations survive their own sign-in or sign-out until the result
settles. Unrelated account changes interrupt pending mutations and clear previous
results. Custom workflows retire on account replacement, including when they
complete authentication; awaiting callers receive interruption. Use an
application-owned lifetime for work that intentionally spans accounts.

The default runtime factory uses a separate memo map per registry. Providing a
client Layer separately acquires another instance unless the host deliberately
shares its memo map. Prefer `auth.runtime` when composing with existing auth atoms.

## Server rendering

Default atoms render `Initial` without fetching. For session-aware rendering:

1. Create request-local atoms with the encoded local `auth.getSession()` result
   as `initialSession`.
2. Acquire their runtime in a request-owned registry to decode the seed, then
   pass that registry to the standard Atom adapter.
3. Serialize only the public session. Hydrate a separate browser registry with
   the same seed; close each registry with its host Scope.

The seed belongs only to the default `getSession()` atom, never an option-bearing
read. It is display data, not authentication authority. Acquisition does not
fetch; browser query reads verify the live cookie. Confirmation of the same account
replaces the seed without a loading gap. A failure or account replacement permanently
retires the seed. Never share server clients, registries, or
request-bearing memo maps across requests, or apply generic late hydration
updates to auth atoms.

The [SSR example](https://github.com/yielded-dev/auth/blob/main/examples/auth/src/auth-ssr.ts)
shows rendering, hydration, and unmount finalizers.
