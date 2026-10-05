---
title: OAuth reference
description: OAuth configuration, routes, sessions, and provider adapters.
---

Start with the [OAuth guide](../guide/oauth) for the flow and choice of API.

## Authorization server

`OAuthServer.make(id, { scopes })` supplies `Identity`, `Service`, `routes`,
`middleware(requiredScopes)`, and `paths`. The acquired `Service` exposes the
origin-dependent `cookieName`. It implements authorization
code with S256 PKCE for registered public clients. It issues MCP bearer tokens;
it does not issue OIDC ID tokens or implement the MCP transport.

Provide these to `oauth.layer`:

| Input                     | Purpose                                                                                                                            |
| ------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| `origin`                  | Authorization server issuer; one server per origin                                                                                 |
| `resource`                | Exact MCP resource URL on that origin, with a non-root path and no query or fragment                                               |
| `clients`                 | `{ clientId, name, redirectUris }[]`; redirect URIs match exactly, including loopback ports                                        |
| `loginPath`               | Local login route that returns to `oauth.paths.authorize`                                                                          |
| `keys`                    | Signing keyring in the same format as session keys; use separate random key material                                               |
| `oauth.Identity`          | `current`: an Effect that verifies the application session and returns `SubjectId` or `undefined`; may require `HttpServerRequest` |
| `OAuthServer.Persistence` | Durable grant storage; use `OAuthServerPersistence.layer` with SQLite, D1, or PostgreSQL                                           |

`Identity.current` runs on every consent GET and POST. Return `undefined` for an
absent or invalid session and fail with `OAuthServer.Unavailable` for an unavailable
dependency. The built-in consent page names the client, subject, resource, scopes,
and redirect host. Approval requires the bound cookie, form token, same Origin,
and the same subject that saw the page. Switching accounts invalidates previously
rendered consent forms. Pending authorization survives the login
redirect in the cookie; do not put it into a login URL. HTTPS consent cookies use
`__Host-yielded-${id}-consent`, Secure, HttpOnly, SameSite=Lax, and Path=/ without a
Domain. Loopback HTTP development uses an unprefixed cookie.

Allow `oauth.paths.authorize` in `OAuthReturnTargets` and have your login page
request that return target. Set `loginPath` to that page. Keep provider and MCP grants separate.

| Route (ID `mcp`, resource `/mcp`)               | Behavior                                                                  |
| ----------------------------------------------- | ------------------------------------------------------------------------- |
| `GET /.well-known/oauth-authorization-server`   | Issuer, endpoints, scopes, public-client authentication and PKCE metadata |
| `GET /.well-known/oauth-protected-resource/mcp` | Resource and authorization server metadata                                |
| `GET /oauth/mcp/authorize`                      | Validate the authorization request, sign in if needed, and show consent   |
| `POST /oauth/mcp/authorize`                     | Approve or deny the browser-bound request                                 |
| `POST /oauth/mcp/token`                         | Redeem a code or rotate a refresh token                                   |
| `POST /oauth/mcp/revoke`                        | Revoke a token's entire grant; unknown tokens also return 200             |

Authorization requires `response_type=code`, `client_id`, `redirect_uri`, `resource`,
`scope`, `code_challenge`, and `code_challenge_method=S256`. Optional `state` is echoed
with the issuer (`iss`) in the callback. Token requests are form-encoded and require
`client_id` and `resource`. Code redemption also requires the original `redirect_uri`
and `code_verifier`. Refresh can retain or reduce scopes; it cannot expand them.
Malformed or rejected requests return 400; dependency failures return 503.

Attach `oauth.middleware(scopes).layer` only to protected routes. It extracts Bearer
credentials with Effect's HTTP APIs, verifies the grant, checks scopes, and supplies
`CurrentAccess` for that request. Missing/invalid tokens return a 401 discovery
challenge; insufficient scope returns 403; unavailable storage returns 503.
`CurrentAccess` defaults to `undefined` outside those requests. Never install a
principal at server startup. Use Effect's existing Origin checks and CORS middleware;
expose `WWW-Authenticate` to browser MCP clients.

### Token lifecycle and storage

Consent expires after five minutes, authorization codes after one minute, access
tokens after ten minutes, and grants after thirty days. Refresh does not extend
the grant's lifetime. Signing keys must remain available through the lifetimes of
the credentials they signed. Tokens are opaque to clients and use Yielded's signed
envelope rather than JWT serialization.

Each grant occupies one row in `yielded_oauth_server`. Apply
`OAuthServerPersistence.migration` through your application's migrations. The adapter
rejects ambient transactions and uses a conditional write for every transition;
revocation cannot be overwritten by a concurrent refresh. It stores no bearer or
provider tokens. Expired rows can be deleted using `expires_at_millis`.

Verification checks storage on every request. Refresh immediately invalidates the
previous access token. Reusing a consumed code or refresh token revokes the entire
grant, including after concurrent refresh attempts. Clients must serialize refresh
and replace their stored token pair. Revocation stops subsequent requests, but does
not cancel work already authorized. Application logout does not revoke MCP grants;
trusted application code can call `Service.revoke(grantId)` when policy requires it.

Issuance returns credentials only after a confirmed commit. An uncertain commit
returns no credentials and is never retried by the server; start a new authorization.
HTTP operations time out after thirty seconds and preserve caller interruption.
Form bodies are limited to 16 KiB. Applications own ingress rate limits and database
cleanup. Apply admission limits to authorization GET requests too: a valid request
allocates a pending row before login. Pending rows expire after five minutes;
schedule cleanup of expired rows using `expires_at_millis`. Exclude OAuth query strings, bodies, cookies, and credentials from access
logs and tracing; the runnable example disables request logging and tracing.

Run `vp run @yielded/example-auth#example:strava-mcp` with the Strava example's
variables plus `MCP_SIGNING_KEY`, `MCP_CLIENT_ID`, and `MCP_REDIRECT_URI`. Configure
that exact client ID and redirect URI in your MCP client. The example listens on
port 3000 and owns `strava-mcp.sqlite`; use HTTPS outside loopback development.

## Retained access

`OAuth.make({ access: profile })` retains the provider grant during normal sign-in.
Without `access`, verified sign-in discards all provider tokens. The profile selects
provider/client registration, scopes/resources, token retention, refresh limits,
and revocation support. It does not provision accounts or select a session mode.

| Service/configuration                                        | Purpose                                                              |
| ------------------------------------------------------------ | -------------------------------------------------------------------- |
| `OAuthSignInPersistence`                                     | Existing account links and single-use sign-in flows                  |
| `OAuthConnectedPersistence`                                  | Grant retention, refresh, disconnect, and durable operation ordering |
| `OAuthConnectedProtocol`                                     | The single code exchange plus refresh and revocation                 |
| `OAuthTransactionProtector`                                  | Encrypted sign-in transaction secrets                                |
| `OAuthConnectedTransactionProtector`                         | Connected-operation transaction secrets                              |
| `OAuthConnectedTokenProtector`                               | Encrypted provider tokens and cleanup jobs                           |
| `OAuthConnectedUseAuthority`, `OAuthConnectedActionEvidence` | Current permission for token use and disconnect                      |
| `SessionClaims`, shared session services                     | Application claims and authentication completion                     |

The Drizzle connected mapping must include `signIn: { credential, flow }` pointing
to the same tables as sign-in persistence, plus `flow.encodeSignIn`. Connected-flow
`subjectId` must allow NULL while identity is unknown. Keep every required unique
constraint and use the database engine's wall clock. See the
[example storage](https://github.com/yielded-dev/auth/blob/main/examples/auth/src/oauth-storage.ts).

The bound strategy exposes `access.ConnectedAccess`, `access.accessLayer`, and
`access.maintenanceLayer`. Install the maintenance service and run its bounded
passes through an application-owned scheduler when profiles support remote
revocation. `Auth` exposes `listAccountConnections` and `disconnectAccount`; public
completion results may include `{ connection: { grantId, profileKey } }`.

Confirmed retention precedes session delivery. A lost commit response releases no
session and never permits repeating the code. Refresh claims are single-use even
after their deadline; unknown external outcomes remain unresolved. Retain the
associated identities and receipts. Known losing exchanges use cohort cleanup jobs
when supported, or discard their tokens locally when revocation is unsupported.
Unresolved exchanges with unknown identity can block cohort cleanup for that client
registration and require application-owned reconciliation; expiry alone is not proof
that the provider operation did not happen.

### Connect an authenticated account

`OAuth.makeConnectedModule` manages provider access independently of sign-in.
Call `Connected.prepareBegin` first: it retains the generated grant identity,
PKCE/state, callback, profile, revisions, and expiry in native flow custody.
Preparation returns only a public flow ID and expiry, plus a private
`connected-intent` credential command. It cannot exchange a code or activate a grant.

A trusted server factor adapter calls `Connected.beginContext` with that private
credential and the original input, verifies independent evidence for the returned
challenge, and then calls `Connected.begin` with the same input and proof. Keep the
challenge's flow ID, binding digest, and full revision unchanged. Re-reading a target
must never rebind an already verified proof. `completeContext` resolves the original
callback target; `disconnectContext` resolves the native grant and command target.
These context methods are server-only services, not public HTTP operations. Factor
selection, proof custody and one-time consumption remain application-owned through
`OAuthConnectedActionEvidence`; ordinary session history is not an exact-action proof.

Use the existing Operation HTTP credential mapping to keep credentials out of JSON:

```ts
const beginRoute = OperationHttpContract.route(connected.operations.Begin, {
  path: "/auth/provider/begin",
  credentials: {
    preparationCredential: "connected-intent",
    actionProof: "pending-proof",
  },
});
```

`Complete` maps `requestBinding` to `request-binding`; map `actionProof` to your
private proof slot for complete and disconnect as well. Execute begin only after
proof authorization to receive the retained authorization URL and move the original
binder into `request-binding`. Keep flow and command IDs across retries. Duplicate
preparations and uncertain commits never authorize issuing a replacement credential.
Disconnect preserves its existing durable command replay and revocation receipts.

Custom persistence adapters must implement `prepare` and `inspectPrepared`, and
change `issue` to atomically promote the exact retained preparation to `Pending`.
Use `OAuthConnectedSealedTransaction` for connected flow storage and transaction
protectors; its bounded envelope includes the retained authorization URL.
Unclaimed connected-management flows from before this cutover must be restarted;
retain grants, exchange receipts and unresolved revocation work. Ordinary sign-in
flow envelopes are unchanged.

### Runnable examples

Run `vp run @yielded/example-auth#example:github` with `GITHUB_CLIENT_ID`,
`GITHUB_CLIENT_SECRET`, `GITHUB_USER_ID`, `SESSION_KEY`, `OAUTH_TRANSACTION_KEY`,
and `OAUTH_TOKEN_KEY`. Open `/login`; the Atom client starts sign-in through the shared
POST action. Register `http://localhost:3000/auth/github/callback` with the provider.
`APP_ORIGIN` overrides the origin; HTTPS is required outside loopback development.

A keyring is `{ activeKeyId, keys: [{ id, material }] }`, where each material is a
redacted base64url encoding of 32 random bytes. Use distinct keys for sessions,
transactions, and provider tokens. Retain old keys while records reference them.
The examples disable request logs and traces that could include callback credentials.

The Strava task is `example:strava`; use `STRAVA_CLIENT_ID`, `STRAVA_CLIENT_SECRET`,
and `STRAVA_ATHLETE_ID` instead, and register `/auth/strava/callback`. The examples own
new `github-auth-v2.sqlite`, `strava-auth-v2.sqlite`, and `strava-mcp-auth-v2.sqlite`
files. The allowlisted provider tuple is explicitly provisioned by the application;
other identities cannot sign in. The example denies connected management actions
until an application supplies independent exact-action evidence; ordinary session
metadata is not treated as a fresh proof.

The former OAuthApp cookie, flow, and grant format is removed. For development,
clear its cookies and reset its flow/grant table before using shared Auth storage.
Existing connected token envelopes also need resetting because they now bind the
exchange order. Preserve account subject IDs, identity tuples, and any receipts or
revocation work needed to reconcile real external credentials; the library performs
no automatic deletion or migration.

## Shared auth setup

Declare the actions for `OAuth` inside `Auth.make`:

```ts title="packages/domain/auth-contract.ts"
import { Schema } from "effect";
import { AuthContract } from "@yielded/auth";

export const AuthApi = AuthContract.make("app/Auth", {
  claims: Schema.Struct({ displayName: Schema.String }),
  actions: (sessions) => ({
    signIn: AuthContract.oauthSignIn(),
    completeSignIn: AuthContract.oauthCompleteSignIn(sessions),
  }),
});
```

### Supply the services

With `AppAuth` from the guide and `AuthRoutes` from a provider page:

```ts title="apps/server/oauth-live.ts"
import { Layer } from "effect";
import { OAuth } from "@yielded/auth";
import * as OAuthCrypto from "@yielded/auth-crypto/OAuth";
import { AppAuth } from "./auth";
import { AuthDependencies } from "./auth-dependencies";
import { resolveOAuthClaims } from "./auth-accounts";
import { transactionKeys } from "./auth-config";
import { OAuthPersistenceLive } from "./auth-persistence";
import { AuthRoutes } from "./github";

const OAuthLive = Layer.mergeAll(
  OAuthPersistenceLive,
  Layer.succeed(AppAuth.strategies.social.SessionClaims, { resolve: resolveOAuthClaims }),
  OAuthCrypto.transactionLayer(transactionKeys),
  OAuth.OAuthReturnTargets.exactRoutes(["/account"]),
);

export const Routes = AuthRoutes.pipe(Layer.provide(OAuthLive), Layer.provide(AuthDependencies));
```

The application modules supply [OAuth persistence](./adapters#oauth), claims,
transaction keys, and [shared auth dependencies](./adapters#compose-the-application-layer).
Flows default to five minutes; the strategy's `policy` overrides this.

## Customize callbacks

Shared auth derives `/auth/{provider}/callback` from `origin` and the contract's
base path. Callbacks require HTTPS, except HTTP on `localhost`, `127.0.0.1`, or
`[::1]` for local development. Provider endpoints always require HTTPS.
Override a provider's path through `Http.layer`:

```ts
const AuthRoutes = Http.layer(AppAuth, {
  origin,
  oauth: {
    providers,
    callbacks: { github: { path: "/login/github/return" } },
  },
});
```

| Customization               | API                                                                                       |
| --------------------------- | ----------------------------------------------------------------------------------------- |
| Multiple destinations       | Array of `{ callbackId, path }`; paths must be unique                                     |
| Select a destination        | Pass `callbackId` at sign-in; otherwise the provider-named or sole entry is used          |
| Custom completion response  | `oauth.respond`, or a provider callback's `respond`                                       |
| Multiple completion actions | Select with `oauth.complete`                                                              |
| Custom HttpApi composition  | `Http.make(AppAuth, options)` exposes `handlers(api)`, `callbackRoutes()`, and middleware |
| Application-owned callback  | Use `GitHub.layer` or `OpenIdClient.layer` with an explicit `redirectUri`                 |

`respond` receives the schema-encoded public result and `{ flowId, provider, callbackId }`.
It returns `Effect<Response, OperationHttpError, R>`; cookie delivery remains managed.
Custom completion actions need `oauthCallback: true` and the single-use request-binding
mapping. See the [registration example](https://github.com/yielded-dev/auth/blob/main/examples/auth/src/login-server.ts).

## Providers

| Integration             | Configure                                                                                                         |
| ----------------------- | ----------------------------------------------------------------------------------------------------------------- |
| GitHub sign-in          | [`GitHub.provider`](../guide/github)                                                                              |
| GitHub with API access  | `GitHub.accessProfile({ clientId, scopes })` and `GitHub.provider({ clientId, clientSecret, access: [profile] })` |
| Strava sign-in / access | `Strava.provider({ clientId, clientSecret, access: profile })`; omit `access` for sign-in only                    |
| OIDC                    | [`OpenIdClient.provider`](../guide/google) with issuer and credentials                                            |
| Plain OAuth             | `OpenIdClient.provider` with endpoints and an identity decoder                                                    |

`GitHub.accessProfile` defaults to `read:user`, rotating refresh tokens, cohort
revocation, and thirty days of local refresh retention. `Strava.accessProfile`
requires scopes and declares unsupported remote revocation. Its adapter rechecks
athlete identity on refresh and limits response bodies to 1 MiB. Custom Effect HTTP clients must reject redirects and
must not retry token exchanges.

For generic providers, registration `access` supplies `clientRegistrationId`,
`profiles`, `resourceIndicators`, `refreshExpiry`, `revocation`, and optional
`refreshParameters`. Those are explicit provider contracts; no refresh or revocation
behavior is inferred from the sign-in scopes.

For plain OAuth with `OpenIdClient`, provide `authorizationEndpoint`, `tokenEndpoint`,
`identitySource.url`, and `identitySource.decodeIdentity`. The decoder returns an
Effect containing the stable `subject` and optional profile. Set scopes explicitly.

### OpenIdClient defaults

| Setting                                | Default               |
| -------------------------------------- | --------------------- |
| `callbackId`                           | Provider key          |
| `configurationGeneration` / `issuance` | `1` / `active`        |
| `timeoutSeconds`                       | `10` (range: 1–30)    |
| `tokenEndpointAuthMethod`              | `client_secret_basic` |
| OIDC scopes / signing algorithm        | `["openid"]` / RS256  |
| Plain OAuth scopes                     | `[]`                  |

S256 PKCE and response issuer validation are required by default. Set
`responseIssuerMode: "unsupported"` only for providers without issuer responses.
Public clients use `authentication: { method: "none", publicClient: true }`.
Load secrets with `Config.Redacted`. Invalid settings fail Layer construction with
`OpenIdClientConfigurationError`.

### Configuration rotation

For shared auth, use `provider({ registrations: [...] })` to retain older entries
with `issuance: "retired"` while flows or connected grants reference them. Assign
a new `configurationGeneration` when settings change and keep one active generation.
Retain old callback paths until their flows expire. When moving a retained permission
profile to another client registration, increase its profile `generation` too; client
exchange counters are independent, and an older profile cannot replace a newer grant.

Earlier GitHub adapters used the issuer `https://github.com`; the current identity
uses `https://github.com/login/oauth`. Old bindings are not reused automatically.
Revoke old grants before upgrading, then register/link and reconnect. Do not rewrite
stored issuers: they are part of identity keys and encrypted context.

## Provider profiles

Verified identity is the provider/issuer/subject tuple. `profile` is optional
metadata: display fields plus bounded `providerData`. It does not authorize account
linking or local roles. Normalized profile display URLs accept only HTTP(S).
Expose only needed fields in claims; still treat profile URLs as untrusted input.

| Consumer                      | Profile access                                               |
| ----------------------------- | ------------------------------------------------------------ |
| Returning shared-auth sign-in | `SessionClaims.resolve({ subjectId, credential, identity })` |
| Shared-auth registration      | Server-side `OAuthRegistrationIntent.profile`                |

`GitHubUserProfile` and `OidcUserProfile` schemas decode the adapters' provider data.
Missing fields remain absent; GitHub nullable values remain null. GitHub's `/user`
email is not asserted verified. Adapters do not fetch additional email or UserInfo
endpoints or retain unknown fields. Connected-grant refresh need not update profiles.

The OIDC adapter also includes Google's `hd` hosted-domain claim in `providerData`
for verified Google ID tokens. Applications can use it to restrict access to a
Google Workspace or Cloud organization. Other issuers' private `hd` claims remain ignored.

Detailed signatures and invariants live beside the
[OAuth source](https://github.com/yielded-dev/auth/tree/main/packages/auth/src/oauth).
