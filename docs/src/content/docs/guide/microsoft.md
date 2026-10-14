---
title: Microsoft Entra ID
description: Set up Sign in with Microsoft Entra ID using the shared OIDC flow.
---

`Microsoft.provider` adds Sign in with Microsoft Entra ID to an
[OAuth strategy](./oauth). It verifies an ID token and establishes your
application's session. The preset does not retain Graph access.

## Configure your app registration

Create an app registration in the
[Microsoft Entra admin center](https://entra.microsoft.com/). Under
**Authentication**, add a web redirect URI for your exact HTTPS callback,
`https://app.example.com/auth/microsoft/callback`. Create a client secret
under **Certificates & secrets**. Request delegated Microsoft Graph
permissions only when your application needs Graph; this preset is sign-in.
See [Microsoft identity platform](https://learn.microsoft.com/en-us/entra/identity-platform/v2-protocols-oidc).

Load the credentials while building the server Layer:

```ts title="apps/server/microsoft.ts"
import { Config, Effect, Layer } from "effect";
import { Http, Microsoft } from "@yielded/auth";

import { AppAuth } from "./auth";

export const AuthRoutes = Layer.unwrap(
  Effect.gen(function* () {
    return Http.layer(AppAuth, {
      origin: yield* Config.String("APP_ORIGIN"),
      oauth: {
        providers: {
          microsoft: Microsoft.provider({
            clientId: yield* Config.String("MICROSOFT_CLIENT_ID"),
            clientSecret: yield* Config.Redacted("MICROSOFT_CLIENT_SECRET"),
            scopes: ["openid", "profile", "email"],
          }),
        },
      },
    });
  }),
);
```

[Supply HTTP, crypto, persistence and application services](../reference/oauth#supply-the-services)
to this Layer. Keep it alive for the server's lifetime. The preset always
requests `openid` and `profile` because Entra requires `profile` for `oid`.
Add `email` when your application needs it.
`offline_access` is available when you later install connected access yourself.
Start with `auth.signIn({ provider: "microsoft", returnTarget: "/account" })`
and redirect to the returned authorization URL. The callback completes sign-in.

## Tenant and identity

`tenant` selects the Entra authority and defaults to `common`. Use
`organizations`, `consumers`, or a tenant GUID when the app registration is
limited to that audience. The commercial cloud host is
`login.microsoftonline.com`. Discovery for `common` and `organizations`
publishes `https://login.microsoftonline.com/{tenantid}/v2.0`. Verification
substitutes the signed `tid` GUID into that template and checks the selected
signing key's `issuer`. A tenant GUID discovered from that document keeps its
own token issuer and still rejects a key restricted to another tenant.
`consumers` uses the personal Microsoft account tenant
`https://login.microsoftonline.com/9188040d-6c67-4c5b-b112-36a304b66dad/v2.0`.
Discovery of that authority, including from the `{tenantid}` document, pins
this issuer, so a work-tenant token is rejected. A tenant domain is not
accepted from that document. A token whose `iss` does not match is rejected.

The durable identity is `(provider key, configured authority, subject)`.
When the token issuer equals the configured authority, the subject is `oid:tid`.
When it does not, the subject is `tid:oid:tid`. Keep that value unchanged.
Never use `email`, `preferred_username`, or the pairwise `sub` as the local
account key. Never link accounts merely because profile emails match, even when
`email_verified` is true.

The preset carries `MicrosoftUserProfile` through ID-token projection.
`oid` and `tid` are required. Declare the same schema on the strategy to get
typed `providerData` in `SessionClaims.resolve`:

```ts
const social = OAuth.make({ profiles: { microsoft: Microsoft.MicrosoftUserProfile } });
```

The library validates the schema before calling your resolver, which can read
`identity.profile?.providerData?.tid` as `string` without decoding it again.
Fields absent from the ID token stay absent. No UserInfo request is made.
`picture` is not a Microsoft ID-token claim. Applications that need a photo
call Microsoft Graph `/me/photo` with their own connected `User.Read` grant.

Entra advertises `private_key_jwt`. This preset authenticates with a client
secret (`client_secret_basic` by default, or `client_secret_post`). Certificate
credentials are not minted here.

## Run the example

The [Microsoft application](https://github.com/yielded-dev/auth/blob/main/examples/auth/src/microsoft-app.ts)
uses the shared Atom browser client, SQL identity storage, and stateless sessions.
It provisions one explicitly configured Entra user and rejects other identities.

1. Forward an HTTPS development origin to `127.0.0.1:3000`. Set `APP_ORIGIN` to that
   public origin and register its `/auth/microsoft/callback` URL on the app registration.
2. Set `MICROSOFT_CLIENT_ID`, `MICROSOFT_CLIENT_SECRET`, `MICROSOFT_OBJECT_ID` (the
   user's `oid`), and `MICROSOFT_TENANT_ID` (the user's `tid`). The example uses
   the `common` authority, so the stored subject is `tid:oid:tid`.
3. Set `SESSION_KEY` and `OAUTH_TRANSACTION_KEY` to distinct base64url encodings of
   32 random bytes. For example, run `openssl rand -base64 32 | tr '+/' '-_' | tr -d '=\n'`
   separately for each key. Preserve these keys across restarts.
4. Run `vp run @yielded/example-auth#example:microsoft` from the repository root and open
   `APP_ORIGIN/login`. Sign in with the configured Microsoft account.
5. After the callback, `/account` returns the local `subjectId` and `role: "owner"`.
   A different object or tenant must not receive a session.

The example stores development state in `examples/auth/microsoft-auth.sqlite`. To
start over, stop the example, remove only that database and its SQLite sidecar
files, and clear cookies for the development origin. This resets this example's
account link and flows. No provider grant is retained, so `OAUTH_TOKEN_KEY` is
not needed.

## Protocol profile

The preset uses Entra's
[v2.0 discovery document](https://login.microsoftonline.com/common/v2.0/.well-known/openid-configuration)
with these constraints:

| Concern                  | Behavior                                                                                                                  |
| ------------------------ | ------------------------------------------------------------------------------------------------------------------------- |
| Issuer                   | Tenant authority; `{tenantid}` templates substitute the verified `tid`; `consumers` uses the personal-account tenant GUID |
| Authorization / callback | `/oauth2/v2.0/authorize`, authorization code, query response                                                              |
| Token exchange           | `/oauth2/v2.0/token`, `client_secret_basic` or `client_secret_post`                                                       |
| Signature                | Advertised RS256, keys at `/discovery/v2.0/keys`; audience, expiry and nonce verified                                     |
| PKCE                     | S256 challenge and captured verifier on every exchange                                                                    |
| Response issuer          | Entra does not advertise RFC 9207 `iss`; use a distinct callback URL                                                      |
| Access                   | Sign-in only; no retained Graph access, refresh, revocation or UserInfo in this preset                                    |

Entra's discovery omits PKCE metadata while the platform documents S256.
The preset supplies that missing capability only after pinning this issuer's
host and v2.0 authorization, token, and JWKS paths. Explicit metadata that
excludes S256 still fails configuration. Generic OIDC providers keep their
existing discovery requirements. Unexpected callback `iss` values are rejected.

Use `registrations` with one active generation and retired previous generations
for [credential rotation](../reference/oauth#configuration-rotation).
