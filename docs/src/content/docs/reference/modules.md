---
title: Public modules
description: Public imports, browser-safe contracts, and optional adapters.
---

Start with `Auth.make` to compose authentication for an application. Choose
individual modules for your methods, session strategy, and integration boundaries.

## Imports and tree shaking

Prefer named namespace imports from the package root:

```ts
import { Auth, AuthContract, Client, Http, Password, Sessions } from "@yielded/auth";
```

Contracts, strategies, and client helpers use the same root import. Distinct
names such as `PasskeyContract` and `Passkey` keep their roles clear.
Lower-level modules such as `HttpServer`, `Rpc`, `Strava`, and `WebCrypto` are
also root namespaces. Access individual exports through the module, for example
`Proofs.ProofKeys` or `WebCrypto.layerWebCrypto`.

Direct module paths remain available and expose the same namespaces:

```ts
import * as AuthContract from "@yielded/auth/AuthContract";
import * as Client from "@yielded/auth/Client";
```

Use direct paths for lazy loading or tighter bundle boundaries; esbuild can
retain unused members of re-exported namespaces. Native ESM loads the root's
static dependencies, so direct paths also narrow loading without a bundler.

The optional `@yielded/auth/contracts` group exports `AuthContract`,
`SessionContract`, `PasskeyContract`, `TotpContract`, and `BrowserLoginContract`.
`@yielded/auth/strategies` groups `Email`, `OAuth`, `Passkey`, `Password`,
`PhoneOtp`, and `Totp`. These are the same modules exposed at the root.

Optional adapters are direct imports, for example `@yielded/auth-persistence-drizzle/Postgres`,
`@yielded/auth-openid-client`, `@yielded/auth-simplewebauthn/Browser`, or
`@yielded/auth/adapters/Twilio`. Install only the peers
required by the selected adapters.

## Application composition

Import application services and authentication methods from the root:

| Modules                                | Purpose                                                                  |
| -------------------------------------- | ------------------------------------------------------------------------ |
| `Auth`                                 | Application service, strategies, and request boundaries.                 |
| `Identity`, `Schema`                   | Subject identifiers, claims, and shared schemas.                         |
| `Operations`, `Hooks`                  | Operation contracts and lifecycle hooks.                                 |
| `Sessions`                             | Session strategies, persistence ports, and lifecycle operations.         |
| `BrowserLogin`, `BrowserLoginContract` | Native browser sign-in, shared handoff operations and platform services. |
| `Password`                             | Password registration, sign-in, and account changes.                     |
| `Email`, `PhoneOtp`, `Proofs`          | Email and phone methods, bound proofs, and private delivery.             |
| `EmailDelivery`                        | Rendered private email, transport failures, templates, and link parsing. |
| `Totp`, `Passkey`                      | Additional factors and passkey workflows.                                |
| `PasskeyPassword`                      | Password-backed authority for passkey workflows.                         |
| `OAuth`                                | Provider sign-in, registration, linked accounts, and connected grants.   |

## Browser and transport boundaries

Keep shared browser/server definitions in the contract modules. Import browser
helpers separately from server verifiers and persistence adapters.

| Modules                                              | Purpose                                                             |
| ---------------------------------------------------- | ------------------------------------------------------------------- |
| `AuthContract`                                       | Shared named actions, schemas, and native HttpApi groups.           |
| `Http`                                               | Request context, cookies, middleware, and mounting named auth APIs. |
| `Client`                                             | Scoped service with typed `client.auth` methods.                    |
| `SessionContract`, `PasskeyContract`, `TotpContract` | Shared public schemas without server orchestration.                 |
| `OperationHttp`                                      | Shared operation HTTP descriptors.                                  |
| `OperationHttpClient`, `OperationHttpServer`         | Client execution and server routing.                                |
| `Atom`                                               | Effect Atom queries, mutations, and client workflows.               |

Import shared contracts, `Client`, and `Atom` from the root. Alias `Atom` as
`AuthAtom` when also using Effect's `Atom` module:

```ts
import { Atom as AuthAtom, AuthContract, Client } from "@yielded/auth";
```

React applications use `@effect/atom-react` with the same importable atoms;
Yielded Auth has no React-specific export.

See [HTTP integration](../guide/http-and-client) for contract sharing,
[Effect Atom client](../guide/client) for workflows, and
[Client and Atom](./client) for options and lifetimes.

## Optional adapters

SDK integrations live in companion packages. Import the platform entrypoint
you use.

| Package or import                         | Integration                                                                                     |
| ----------------------------------------- | ----------------------------------------------------------------------------------------------- |
| `@yielded/auth-simplewebauthn/Browser`    | Browser WebAuthn ceremonies through `make()` or `layer`.                                        |
| `@yielded/auth-simplewebauthn/Server`     | Server verification through `make(options)` or `layer`.                                         |
| `@yielded/auth-react-native`              | iOS passkey ceremonies through `make()` or `layer`; import only in the native entrypoint.       |
| `@yielded/auth-react-native/BrowserLogin` | iOS authentication browser and Keychain vault.                                                  |
| `@yielded/auth-electron/BrowserLogin`     | Main-process system browser and encrypted vault.                                                |
| `@yielded/auth-openid-client`             | OAuth/OIDC verification and provider configuration.                                             |
| `@yielded/auth-openid-client/Connected`   | Connected grant management.                                                                     |
| `@yielded/auth-openid-client/GitHub`      | GitHub configuration and operations using OpenID Client.                                        |
| `@yielded/auth-crypto`                    | Password hashing, TOTP, and OAuth secret protection through `/Password`, `/Totp`, and `/OAuth`. |
| `@yielded/auth-persistence`               | Direct Effect SQL persistence; requires an application-provided SQL client.                     |
| `@yielded/auth-persistence-drizzle`       | Drizzle mappings and explicit driver modules such as `/Postgres` and `/SqliteBun`.              |
| `@yielded/auth/adapters/Twilio`           | SMS delivery through Effect HTTP; requires `TwilioConfig`.                                      |

Core has only Effect as a runtime peer. It owns schemas, workflows, and service contracts. Adapters depend on those
public contracts; core never imports or re-exports an SDK adapter. An application
chooses the adapter Layer and supplies storage, policy, and delivery authority.

`@yielded/auth-persistence` exports the named `AuthPersistence` facade for direct
Effect SQL and has no Drizzle dependency or declarations. The Drizzle companion's
driver modules export the same facade; its root exposes the Drizzle mapping contracts.
Adapter authors can use `@yielded/auth-persistence/Adapter` for the shared SQL kernels.

The [adapter guide](./adapters) covers transaction authority, durable receipts,
and runtime constraints.

## Lower-level composition

`Password.makeModule`, `Email.makeModule`, and `Sessions.make` expose the same
implementations that `Auth.make` binds. Use them when you own operation composition;
`Auth.make` supplies the application service and request boundary.

Storage implements the strategy ports in `Password`, `Email`, `Proofs`, and
`Sessions`. Password hashing comes from `@yielded/auth-crypto/Password`.
Application account services provide identity authority and session claims.
`SmsDelivery` and `EmailDelivery.EmailDelivery` own private delivery. Auth renders
email content before sending it; see the [transport recipes](../guide/email-delivery).

`OAuth.make({ access: profile })` combines provider sign-in and retained API access
with shared Auth sessions. `OAuth.make()` discards provider tokens after sign-in.

API comments and signatures live beside the
[public source modules](https://github.com/yielded-dev/auth/tree/main/packages/auth/src).
