<h1 align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset=".github/assets/lockup-auth-paper.svg" />
    <img src=".github/assets/lockup-auth-ink.svg" alt="Yielded Auth" height="48" />
  </picture>
</h1>

<p align="center">
  <a href="https://www.npmjs.com/package/@yielded/auth"><img alt="npm" src="https://img.shields.io/npm/v/@yielded/auth/beta?label=npm&labelColor=121310&color=ffb45e" /></a>
  <a href="https://github.com/yielded-dev/auth/actions/workflows/ci.yml"><img alt="CI" src="https://img.shields.io/github/actions/workflow/status/yielded-dev/auth/ci.yml?branch=main&label=ci&labelColor=121310" /></a>
  <a href="LICENSE"><img alt="MIT license" src="https://img.shields.io/badge/license-MIT-f3f1e8?labelColor=121310" /></a>
</p>

<p align="center">
  <a href="https://yielded.dev/auth/"><b>Documentation</b></a>
  ·
  <a href="https://yielded.dev/auth/guide/getting-started/">Getting started</a>
  ·
  <a href="https://yielded.dev">yielded.dev</a>
</p>

Composable authentication, sessions, and identity workflows for Effect.

Define your contract with Schema, supply infrastructure with Layers, and call auth
alongside your other Effects. The same contract connects your server to an Effect
HttpClient service and Effect Atom queries and mutations.

Your application owns its accounts, identifiers, and authorization policy.
Use managed auth tables, map an existing SQL schema, or implement storage services
against another backend. The auth API stays the same when you change storage.
Core has only Effect as a runtime peer; companion packages supply database,
cryptography, and protocol adapters.

Start with [Auth in an Effect application](docs/src/content/docs/guide/effect.mdx)
or compare [database and backend choices](docs/src/content/docs/guide/storage.mdx).
The [four account apps](docs/src/content/docs/guide/examples.md#run-an-account-app)
show managed Drizzle, custom Drizzle, Effect SQL, and non-SQL persistence.

Install the beta release with Effect:

```sh
bun add @yielded/auth@beta effect
```

Prefer named namespace imports from `@yielded/auth`. Direct module paths such as
`@yielded/auth/AuthContract` remain available; see the
[import guide](docs/src/content/docs/reference/modules.md#imports-and-tree-shaking).

## One API, server and client

Define the shared contract in `packages/domain/auth-contract.ts`:

<!-- #region auth-contract -->

```ts [packages/domain/auth-contract.ts]
import { Schema } from "effect";
import { AuthContract } from "@yielded/auth";

export const AuthApi = AuthContract.make("app/Auth", {
  claims: Schema.Struct({ displayName: Schema.String }),
  actions: (sessions) => ({ signIn: AuthContract.passwordSignIn(sessions) }),
});
```

<!-- #endregion auth-contract -->

Bind the server implementation and mount its HTTP routes:

<!-- #region auth-server -->

```ts [apps/server/auth.ts]
import { Auth, Http, Password, Sessions } from "@yielded/auth";

import { AuthApi } from "@app/domain/auth-contract";

export const AppAuth = Auth.make(AuthApi, {
  sessions: Sessions.stateful({ maxAge: "8 hours", idleTimeout: "30 minutes" }),
  strategies: { password: Password.make() },
  defaultStrategy: "password",
});

export const AuthRoutes = Http.layer(AppAuth, { origin: "https://app.example.com" });
```

<!-- #endregion auth-server -->

The eight-hour lifetime and thirty-minute idle timeout are application policy.
Supply your persistence and account Layers to `AuthRoutes`, then merge it with
your router. For application routes that call auth, use the middleware shown in the
[router composition](docs/src/content/docs/guide/http-and-client.mdx#configure-the-server).
Inside an existing Effect handler, call the service directly:

<!-- prettier-ignore -->
```ts
const auth = yield* AppAuth;
const result = yield* auth.signIn({ email, password });
```

The request context supplies credentials and cookie delivery. `auth.getSession()`,
`auth.requireSession()`, and `auth.signOut()` use the same boundary. An
`Authenticated` sign-in result contains a session with typed `claims.displayName`.

Create the client and its atoms from the same contract:

<!-- #region auth-client -->

```ts [apps/web/auth-client.ts]
import { Atom as AuthAtom, Client } from "@yielded/auth";

import { AuthApi } from "@app/domain/auth-contract";

export const AppClient = Client.make(AuthApi, { baseUrl: "https://app.example.com" });
export const auth = AuthAtom.make(AppClient);
```

<!-- #endregion auth-client -->

Use `auth.session`, `auth.signIn`, and `auth.signOut` with ordinary
`@effect/atom-react` hooks. Auth mutations refresh auth queries automatically;
React renders and dispatches. Compose your own queries through the same client:

<!-- #region auth-query -->

```ts [apps/web/member-name.ts]
import { Effect } from "effect";

import { AppClient, auth } from "./auth-client";

export const memberName = auth.runtime.atom(
  Effect.gen(function* () {
    const client = yield* AppClient;
    const session = yield* client.auth.getSession();

    return session?.claims.displayName ?? null;
  }),
);
```

<!-- #endregion auth-query -->

Fetch is configured by default. To customize transport, compose `AppClient.layer`
with your HttpClient Layer and pass `{ layer: ClientLive }` to `AuthAtom.make`. See the
[client guide](docs/src/content/docs/guide/client.mdx)
for React, shared invalidation, and standalone Effect calls.

Add [passwords](docs/src/content/docs/guide/passwords.md),
[passkeys](docs/src/content/docs/guide/passkeys.md),
[email](docs/src/content/docs/guide/codes.md) or [phone codes](docs/src/content/docs/guide/phone.md),
[two-factor authentication](docs/src/content/docs/guide/totp.mdx), and
[OAuth](docs/src/content/docs/guide/oauth.mdx) through strategies and their required Layers.
OAuth can also retain encrypted provider grants for calling APIs after sign-in.

Start with the [documentation](https://yielded.dev/auth/) and
[consumer examples](examples/auth). The public library lives in
[`packages/auth`](packages/auth); examples are leaf workspaces.

## Development

Install Bun and Vite+, then run:

```sh
vp install
vp run patch:tsgo
vp run ready
```

The [toolchain guide](docs/TOOLCHAIN.md) covers release setup and contributor rules.
Shared versions live in the root catalog. Formatting, linting, strict TypeScript,
package exports, dependency purity, tests, and builds use Vite+.

## License

[MIT](LICENSE)
