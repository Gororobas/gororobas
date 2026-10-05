---
title: Getting started
description: Add authentication to your Effect application with a shared contract, server Layers, and client atoms.
---

Define a shared contract, bind it to authentication strategies, and supply your
application's services with Layers. The same contract gives your client typed
Effects and atoms.

## Install

```sh
bun add @yielded/auth@beta effect
```

For React, also install `@effect/atom-react`. Add companion packages for the
[storage and protocol adapters](../reference/adapters) you choose.

## Define the shared contract

<!--@include: @/../README.md#auth-contract-->

`claims` is the data each session carries. `actions` lists what clients may call;
here, password sign-in. Every contract also includes `getSession`,
`requireSession`, `signOut`, and `renewSession`. Keep this module free of server
configuration, keys, and persistence so the browser can import it.

## Bind the server

<!--@include: @/../README.md#auth-server-->

`Auth.make` declares a yieldable service; constructing it performs no I/O.
`Http.layer` serves the contract's actions as routes and owns cookies, Origin,
and CSRF checks.

## Supply storage and accounts

The type of `AuthRoutes` lists every service your methods still need. The library
supplies Web Crypto and empty lifecycle hooks; you supply the rest:

| You supply                                    | With                                                                                  |
| --------------------------------------------- | ------------------------------------------------------------------------------------- |
| Storage for credentials, sessions, and proofs | [Managed tables, your schema, or your services](./storage)                            |
| Account checks and session claims             | Your account Layers; see [passwords](./passwords#supply-the-services)                 |
| Password hashing                              | `@yielded/auth-crypto/Password`                                                       |
| Proof and request-binding keys                | Your secrets; see [Layer wiring](../reference/adapters#compose-the-application-layer) |

Provide them to `AuthRoutes` and merge it with your router:

```ts title="apps/server/routes.ts"
import { Layer } from "effect";

import { ApplicationRoutes } from "./application-routes";
import { AuthRoutes } from "./auth";
import { AuthDependencies } from "./auth-live"; // storage, accounts, hashing, keys

export const Routes = Layer.mergeAll(AuthRoutes, ApplicationRoutes).pipe(
  Layer.provide(AuthDependencies),
);
```

The [managed Drizzle app](https://github.com/yielded-dev/auth/tree/main/examples/persistence-drizzle-managed/src)
is a complete composition: `schema.ts` maps a customer table, `live.ts` supplies
accounts and storage, and `server.ts` serves the routes.

## Call auth on the server

Inside an Effect route covered by the [auth middleware](./http-and-client#application-routes),
call the service with your validated input:

<!-- prettier-ignore -->
```ts
const auth = yield* AppAuth;
const result = yield* auth.signIn({ email, password });
```

The request boundary supplies credentials and delivers the session cookie. An
`Authenticated` result carries the typed session; an additional-factor result must
be completed before you grant access. Failures stay typed in the error channel; see
[rejected sign-ins](./passwords#handle-a-rejected-sign-in).

## Call it from the client

<!--@include: @/../README.md#auth-client-->

Use `auth.session`, `auth.signIn`, and `auth.signOut` directly as queries and
mutations with ordinary `@effect/atom-react` hooks. Compose your own queries
through `auth.runtime` to share the client and account lifetime:

<!--@include: @/../README.md#auth-query-->

Fetch is configured by default. To customize transport, compose `AppClient.layer`
with your HttpClient Layer and pass `{ layer: ClientLive }` to `AuthAtom.make`.
The [Effect Atom client guide](./client)
shows React, shared invalidation, and standalone Effect calls.

## Choose your next step

- [Auth in an Effect application](./effect): services, Layers, identity, and ownership.
- [Database and backend choices](./storage): keep managed tables, map your schema, or supply services.
- [HTTP integration](./http-and-client): mount routes and protect application handlers.
- [Effect Atom client](./client): render sessions, handle mutations, and compose workflows.

Then add an authentication method, such as [passkeys](./passkeys) or
[GitHub sign-in](./github). Each method adds its required services to the server;
its public actions belong in the shared contract.
