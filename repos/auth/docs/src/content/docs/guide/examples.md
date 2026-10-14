---
title: Examples
description: Run a complete account app or explore focused authentication and client examples.
---

Use these examples to compare backend choices or explore a particular feature.
All examples use the package's public API. For the setup in your own application,
start with [getting started](./getting-started).

## Run an account app

Four apps implement the same registration, email verification, password and
passkey sign-in, passkey enrollment, password recovery, and sign-out across the
three [storage levels](./storage): managed tables, your schema, and your services.

| App                                                                                                        | You own                                                                 | Backend              |
| ---------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------- | -------------------- |
| [Managed&nbsp;Drizzle](https://github.com/yielded-dev/auth/tree/main/examples/persistence-drizzle-managed) | Your customer table. Drizzle Kit generates the auth tables' migrations. | SQLite               |
| [Custom&nbsp;Drizzle](https://github.com/yielded-dev/auth/tree/main/examples/persistence-drizzle-custom)   | Every table and migration, mapped through Drizzle.                      | SQLite               |
| [Effect&nbsp;SQL](https://github.com/yielded-dev/auth/tree/main/examples/persistence-sql)                  | Every table and migration, written in Effect SQL.                       | SQLite or PostgreSQL |
| [Custom&nbsp;services](https://github.com/yielded-dev/auth/tree/main/examples/persistence-custom)          | The storage and sign-in services, here a single-writer file store.      | Local file           |

Clone the repository, install dependencies with `vp install`, and run an app's
`start` task from the repository root. Managed Drizzle delivers email to local
files; the other apps send through Cloudflare, configured as their READMEs describe:

```sh
vp -C examples/persistence-drizzle-managed run start
```

Open the URL printed by the server. The apps use ports 4181–4184 in table order
and keep separate local data across restarts. Their READMEs describe environment
variables, database migrations, and data resets.

The Effect SQL app also includes an
[OAuth account-settings journey](https://github.com/yielded-dev/auth/tree/main/examples/persistence-sql#oauth-account-settings)
with sign-in, linked login identities, provider callbacks and unlink. Run
`vp -C examples/persistence-sql run start:oauth` with a GitHub OAuth App configured
as its README describes. The screen consumes the public
`listLinkedAccounts` query through Effect Atom; provider API grants are separate.

## Authentication methods

| Source                                                                                                  | Integration                                   |
| ------------------------------------------------------------------------------------------------------- | --------------------------------------------- |
| [Passwords](https://github.com/yielded-dev/auth/blob/main/examples/auth/src/password-methods.ts)        | Registration, sign-in, and account changes.   |
| [Email](https://github.com/yielded-dev/auth/blob/main/examples/auth/src/email-methods.ts)               | Codes, magic links, and address workflows.    |
| [Phone OTP](https://github.com/yielded-dev/auth/blob/main/examples/auth/src/phone-sqlite-bun.ts)        | Phone authentication backed by SQLite on Bun. |
| [Password hashing](https://github.com/yielded-dev/auth/blob/main/examples/auth/src/password-hashing.ts) | Hashing policy and verification.              |

Start with the [GitHub](./github) or [Google](./google) setup guide. The
[GitHub OAuth composition](https://github.com/yielded-dev/auth/blob/main/examples/auth/src/github-oauth-app.ts)
shows provider and application wiring.

## Sessions and identity

| Source                                                                                           | Integration                                                    |
| ------------------------------------------------------------------------------------------------ | -------------------------------------------------------------- |
| [Sessions](https://github.com/yielded-dev/auth/blob/main/examples/auth/src/sessions.ts)          | Session lifecycle and strategy selection.                      |
| [Identity](https://github.com/yielded-dev/auth/blob/main/examples/auth/src/identity-boundary.ts) | Application-owned subject identifiers and identity resolution. |
| [Proofs](https://github.com/yielded-dev/auth/blob/main/examples/auth/src/proofs.ts)              | Bound proofs and private delivery.                             |
| [Hooks](https://github.com/yielded-dev/auth/blob/main/examples/auth/src/lifecycle-hooks.ts)      | Lifecycle hook composition.                                    |

## Database adapters

The [runnable persistence apps](../reference/adapters#runnable-examples) share the
same account workflows with managed Drizzle, application-owned Drizzle, raw SQL,
or custom services. Start with the managed Drizzle app for local SQLite setup.
The [adapter reference](../reference/adapters) lists the supported drivers and
explains transaction and retry requirements.

## HTTP and browser clients

Start with the named API examples:

| Source                                                                                                 | Integration                                          |
| ------------------------------------------------------------------------------------------------------ | ---------------------------------------------------- |
| [Shared contract](https://github.com/yielded-dev/auth/blob/main/examples/auth/src/auth-contract.ts)    | Auth actions beside an existing HttpApi group.       |
| [Server](https://github.com/yielded-dev/auth/blob/main/examples/auth/src/auth-server.ts)               | `Auth.make`, handlers, and raw router mounting.      |
| [Client](https://github.com/yielded-dev/auth/blob/main/examples/auth/src/auth-client.ts)               | `Client.make`, importable atoms, and Effect queries. |
| [React](https://github.com/yielded-dev/auth/blob/main/examples/auth/src/auth-react.ts)                 | Standard Atom registry and hooks.                    |
| [SSR](https://github.com/yielded-dev/auth/blob/main/examples/auth/src/auth-ssr.ts)                     | Request-local registries and session hydration.      |
| [Protected endpoints](https://github.com/yielded-dev/auth/blob/main/examples/auth/src/session-http.ts) | Typed session middleware on an HttpApi.              |

The Studio example separates
[auth composition](https://github.com/yielded-dev/auth/blob/main/examples/auth/src/studio-auth.ts),
[HTTP server](https://github.com/yielded-dev/auth/blob/main/examples/auth/src/studio-http-server.ts),
and [browser client](https://github.com/yielded-dev/auth/blob/main/examples/auth/src/studio-browser.ts).
These are lower-level integration references rather than a packaged application.
The [HTTP integration](./http-and-client) and [Effect Atom client](./client)
guides explain how these pieces fit together.

Example stores, keys, delivery services, and policies are disposable development
fixtures. Replace them with your application's authority and durable adapters before
using the same composition in a deployed service.
