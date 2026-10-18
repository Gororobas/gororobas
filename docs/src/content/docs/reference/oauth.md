---
title: OAuth reference
description: OAuth configuration, services, and provider adapters.
---

Start with the [OAuth guide](../guide/oauth) for the flow and choice of API.

## Authorization server

`OAuthServer.make(id, { scopes })` provides `Identity`, `Service`, `routes`,
`middleware(requiredScopes)`, and `paths`. It supports authorization code with PKCE
for MCP clients, including static registrations and Client ID Metadata Documents
(CIMD). Use the [OpenID profile](#shared-openid-sign-in) for shared browser sign-in.

Declare scopes with `OAuthScope.make("documents:read")` from `@yielded/auth`. The result
is a branded `OAuthScope.OAuthScope<"documents:read">` value. Pass these values in `scopes`;
middleware, authorization, and verified access retain their literal types. Plain
strings are not accepted as scope declarations. `OAuthScope.OAuthScope` is the Effect schema
for decoding scope strings at external boundaries.

Provide these to `oauth.layer`:

| Input            | Purpose                                                              |
| ---------------- | -------------------------------------------------------------------- |
| `origin`         | Public issuer origin                                                 |
| `resource`       | Exact MCP resource URL on that origin                                |
| `clients`        | Static client registrations; may be empty with CIMD                  |
| `clientMetadata` | Optional `{ allowedOrigins }` policy for metadata and JWKS discovery |
| `loginPath`      | Login route that returns to `oauth.paths.authorize`                  |
| `keys`           | Signing keyring; use separate random material from session keys      |
| `oauth.Identity` | Verify the current application session                               |

Provide durable `OAuthServer.Persistence` plus `HttpClient`, `Crypto`, `Hmac`, and
`Signature`.

`Identity.current` returns the verified `SubjectId` or `undefined`; dependency
failure uses `OAuthServer.Unavailable`. Consent is bound to that user and browser.
Allow `oauth.paths.authorize` in your login flow's `OAuthReturnTargets`.

| Route, for ID `mcp` and resource `/mcp`         | Purpose                                 |
| ----------------------------------------------- | --------------------------------------- |
| `GET /.well-known/oauth-authorization-server`   | Issuer and supported protocol metadata  |
| `GET /.well-known/oauth-protected-resource/mcp` | Resource metadata                       |
| `GET/POST /oauth/mcp/authorize`                 | Validate the request and obtain consent |
| `POST /oauth/mcp/token`                         | Redeem a code or rotate a refresh token |
| `POST /oauth/mcp/revoke`                        | Revoke the token's grant                |

All clients use S256 PKCE. Code redemption includes the original callback and
`code_verifier`; token requests also identify the client and resource. Refresh may
retain or reduce scopes. Request errors return 400, failed HTTP Basic authentication
returns 401 with a challenge, and unavailable dependencies return 503.

### Clients and metadata discovery

Static clients configure `clientId`, `name`, and `redirectUris`. Add a redacted
`clientSecret` for Basic/form-secret authentication, or `clientAssertion: { jwks }`
or `{ jwksUri }` for `private_key_jwt`. Configure one authentication method.
`grantTypes` permits `authorization_code` and/or `refresh_token`.

Callbacks match exactly. A native client's loopback callback may vary its port;
the selected callback remains bound to the authorization code.

Set `clientMetadata.allowedOrigins` to enable trusted HTTPS metadata discovery.
A document declares its exact URL as `client_id`, a `client_name`, and
`redirect_uris`. It can declare public authentication or `private_key_jwt` with a
public key source. Static registrations take precedence.

Use an HTTP client and network policy that reject private, loopback, and link-local
destinations after DNS resolution. Disable redirects and ambient credentials.
Origin allowlists alone do not provide network isolation.

| Discovery limit               | Value                                     |
| ----------------------------- | ----------------------------------------- |
| Metadata / JWKS body          | 5 KiB / 128 KiB                           |
| Request timeout / concurrency | 5 seconds / 8 requests per server Layer   |
| Cache lifetime / entries      | At most 5 minutes / 256 entries per cache |

Errors and private or non-cacheable responses are not cached. Metadata changes take
effect when cached entries expire and can invalidate outstanding grants.

### Private-key client assertions

Send a fresh JWT in `client_assertion` with
`client_assertion_type=urn:ietf:params:oauth:client-assertion-type:jwt-bearer`.
Its issuer and subject identify the client, its audience identifies the issuer or
endpoint, and its `jti` is unique for that client. Assertions expire within five
minutes and are limited to 8 KiB. Supported algorithms are RS256, PS256, ES256, and
EdDSA. Retain old public keys through the JWKS cache interval when rotating them.

Each assertion is single-use across server instances. A lost acknowledgment needs
a fresh assertion; an uncertain token-issuance outcome still requires a new
authorization flow.

### Protecting MCP routes

Provide `oauth.middleware(scopes).layer` to protected routes. It verifies the bearer
grant and supplies `oauth.CurrentAccess` with the declared scope union for that request.
The shared `OAuthServer.CurrentAccess` remains available with string scopes. Require
a defined value and apply your application's account and operation permissions.

Missing or invalid credentials return 401 with discovery information; insufficient
scope returns 403; unavailable storage returns 503. Configure CORS for the MCP,
token, metadata, and revocation routes, exposing `WWW-Authenticate` as needed.
Keep the consent endpoint under its same-origin policy.

### Token lifecycle and storage

| Lifetime           | Default                             |
| ------------------ | ----------------------------------- |
| Pending consent    | 5 minutes                           |
| Authorization code | 1 minute                            |
| Access token       | 10 minutes                          |
| Grant              | 30 days; refresh does not extend it |

Use `OAuthServerPersistence.layer` with SQLite, D1, or PostgreSQL and apply its
`migrations` through your application. Server replicas sharing an issuer share
storage and signing keys. Keep keys and replay receipts until their credentials
expire; schedule expired-row cleanup and ingress rate limits.

Tokens are opaque to clients. Refresh invalidates the previous access token, so
clients serialize refresh and replace the token pair. Reusing a consumed code or
refresh token revokes its grant. Logout is separate; trusted application code can
call `Service.revoke(grantId)` when policy requires it.

Credentials are delivered after confirmed commits. An uncertain issuance outcome
requires a new authorization flow. Exclude credentials and authorization/callback
URLs from logs and traces. HTTP operations have a 30-second cooperative deadline;
form bodies are limited to 16 KiB.

See the [Strava MCP example](https://github.com/yielded-dev/auth/blob/main/examples/auth/src/strava-mcp.ts)
for a complete server composition.

## Shared OpenID sign-in

`OAuthServer.makeOpenId(id, { scopes })` adds discovery, authorization code with
PKCE, RS256 ID tokens, JWKS, and UserInfo for registered applications. Optional
`scopes` is an array of branded `OAuthScope` values. The standard `openid`,
`profile`, and `email` scopes are included automatically.

Supply the server options above without `clientMetadata`; `resource` is optional.
OpenID also requires:

| Input              | Purpose                                                       |
| ------------------ | ------------------------------------------------------------- |
| `identityKeys`     | `{ activeKeyId, privateKey, publicKeys }` RSA signing keyring |
| `Identity.current` | Verify the browser session and return `Authentication`        |
| `Identity.active`  | Recheck current session authority                             |
| `Identity.profile` | Authorize disclosure of profile and email claims              |

Optional OpenID server options are:

| Input                       | Default                    | Purpose                                                                                |
| --------------------------- | -------------------------- | -------------------------------------------------------------------------------------- |
| `resource`                  | This server's UserInfo URL | Exact audience for access tokens, including a separate HTTPS resource server           |
| `accessTokenFormat`         | `"opaque"`                 | Set `"jwt"` with an explicit `resource` for public-key verification                    |
| `accessTokenLifetimeMillis` | `600_000`                  | Access lifetime between one second and ten minutes                                     |
| `refreshTokens`             | `false`                    | Issue rotating refresh tokens to clients whose `grantTypes` includes `"refresh_token"` |

`Authentication` carries the subject, session, security revision, original
`authenticatedAtMillis`, and expiry. Viewing consent does not refresh authentication.

| Route, for ID `identity`                | Purpose                              |
| --------------------------------------- | ------------------------------------ |
| `GET /.well-known/openid-configuration` | Issuer metadata                      |
| `GET /oauth/identity/jwks`              | Public verification keys             |
| `GET/POST /oauth/identity/authorize`    | Authentication and consent           |
| `POST /oauth/identity/token`            | Code redemption and optional refresh |
| `GET/POST /oauth/identity/userinfo`     | Scoped claims                        |
| `POST /oauth/identity/revoke`           | Grant revocation                     |

Request `openid`, optionally `profile` and `email`. Supported prompts are `login`,
`select_account`, `consent`, and `none`; `max_age` requires recent authentication.
The default consent policy requires interaction. Supply `OAuthServer.OpenIdConsent`
to recognize application-approved clients, callbacks, and claims.

ID tokens last at most five minutes and access tokens at most ten, bounded by the
originating session. An enabled refresh grant lasts at most thirty days, bounded
by the original session expiry. Refresh checks `Identity.active` and application
authorization without reading a browser session or contacting its upstream
provider. It retains the original `auth_time`, rotates the refresh token, and can
only retain or reduce granted scopes. Reusing a consumed refresh token revokes
its grant. Applications own local logout; dynamic clients and coordinated browser
logout are unsupported. Retain public verification keys through token expiry.

### Application authorization and resource access

Provide the server's `Authorization` service to authorize application scopes. Its
`authorize` Effect runs at code exchange and every refresh with the authentication,
client ID, resource, requested scopes, and grant type. Return a subset of those
scopes, including `openid`; an empty result denies issuance. The default service
grants only the standard OpenID scopes, never application scopes.

```ts
import { OAuthScope, OAuthServer } from "@yielded/auth";

const ReadDocuments = OAuthScope.make("documents:read");
const WriteDocuments = OAuthScope.make("documents:write");
const server = OAuthServer.makeOpenId("identity", {
  scopes: [ReadDocuments, WriteDocuments],
});

const authorization = Layer.succeed(server.Authorization, {
  authorize: ({ authentication, clientId, resource, scopes, grantType }) =>
    accountPolicy.authorize({ authentication, clientId, resource, scopes, grantType }),
});
// accountPolicy returns { scopes: [OAuthScope.make("openid"), ReadDocuments],
//   claims: { accountId: "application-account" } } after checking current access.
```

The callback's input and output scopes use the branded literals plus `openid`,
`profile`, and `email`; `Identity.profile` receives the same union. Unknown scopes
are also rejected at runtime.

Optional JSON `claims` are recomputed on each authorization and nested in the
access token; they cannot override protocol fields. Decode them with the resource
server's application schema. Issuance rejects claims that make the token or its
authenticated revocation form exceed their size limits. ID tokens retain the client audience and identity
claims only. When `resource` differs from UserInfo, discovery omits UserInfo and
the UserInfo route rejects those access tokens.

For a resource server, construct `OAuthServer.makeAccessTokenVerifierWithKeySet({
issuer, resource })` and supply `Jwks.Jwks` from `@yielded/jose` plus
`@yielded/crypto/Signature`. Its `verify(Redacted.make(token))` Effect checks RS256,
the `at+jwt` type, issuer, audience, expiry, and scope encoding, then returns
`OAuthServer.Access` with the subject, client, grant, resource, scopes, and optional
application claims. It captures the two services while using the caller's clock.

For remote keys, build `Jwks.layerRemote({ url: "https://issuer.example/keys" })`
once in the application's runtime and provide an Effect HttpClient. The configured
URL is trusted application policy; tokens cannot select it. JOSE owns the
[bounded cache and refresh](./jose.mdx#local-and-remote-public-key-sets).
Keep its Scope open while using the verifier. Remote-key failures return
`OAuthServer.Unavailable`; invalid credentials return `OAuthServer.InvalidToken`.

On Workers, register the bounded verification's `runPromiseExit` promise with
`ctx.waitUntil`, then await it natively in each request before protected work.
Do not abort that retained verification on client disconnect: other requests may
still need its refresh. Keep the refresh deadline within the platform's lifetime
extension; the default is five seconds. The
[minimal Worker fixture](https://github.com/yielded-dev/auth/blob/main/packages/auth/test/fixtures/workers-access-token.ts)
shows the composition. Cookies, application claims and permissions stay with the host.

For preloaded keys, `OAuthServer.makeAccessTokenVerifier({ issuer, resource,
publicKeys })` needs only `Signature`. Reacquire it when the trusted keys rotate.

Pass `scopes: [ReadDocuments, OAuthScope.make("openid")]` to restrict verified access
to those branded literals, including every accepted standard scope. Without this
option, verified scopes have the broader `OAuthScope.OAuthScope` type. Scope names remain
strings on the wire and are never transformed during verification.

Offline verification observes permission changes and revocation at access-token
expiry. Choose a short access lifetime, such as five minutes, and refresh through
the issuer to recheck current access. The issuer's `Service.verify` additionally
checks current session authority and the durable grant version.

Both server profiles accept `OAuthServer.ConsentRenderer`. A custom renderer must
escape displayed values and preserve the supplied POST action, CSRF field, and
decision. See the [shared sign-in example](https://github.com/yielded-dev/auth/tree/main/examples/persistence-sql#hosted-yielded-sign-in).

## Retained access

`OAuth.make({ access: profile })` retains an encrypted provider grant during sign-in.
The profile declares scopes, resources, refresh limits, and revocation support.
Account provisioning and session mode remain application choices.

- `OAuthSignInPersistence`: account links and sign-in flows.
- `OAuthConnectedPersistence`: retained grants, refresh, disconnect, and cleanup.
- `OAuthConnectedProtocol`: provider exchange, refresh, and revocation.
- `OAuthTransactionProtector`: private sign-in transaction data.
- `OAuthConnectedTransactionProtector`: private connected-operation data.
- `OAuthConnectedTokenProtector`: encrypted provider tokens.
- `OAuthConnectedUseAuthority`: permission to use a token.
- `OAuthConnectedActionEvidence`: authorization for management actions.
- `SessionClaims` and session services: application authentication completion.

Connected persistence and sign-in share login ownership and subject authority.
[Composed persistence](./adapters#oauth) supplies the sign-in, connected, and
revocation services when `access` is enabled. Your application still supplies
provider configuration, encryption keys, claims, and use/action authorization.
The strategy exposes `access.ConnectedAccess`, `access.accessLayer`, and
`access.maintenanceLayer`. Provide those Layers with the same services.

`withAccessToken` checks current access before releasing a redacted token to your
callback. The library does not retry the callback. Refresh preserves identity and
session assurance; an unknown refresh outcome requires fresh authorization.
Reconnect replaces the unresolved grant while retaining its connection ID.

Disconnect stops future local use. Tokens already released may remain in flight.
Profiles with provider revocation need an application-scheduled maintenance worker;
provider-wide revocation can also affect a later authorization. Unknown revocation
outcomes are not retried automatically.

### Register and link accounts

`OAuth.makeRegistration` retains verified identity while your application collects
its registration payload. `RegistrationAuthority` owns admission and provisioning.
By default, registration returns `RegistrationAccepted`; start a fresh sign-in to
establish a session.

To continue authentication after registration, enable `authenticate` on both the
strategy and its shared action:

```ts
OAuth.makeRegistration({ registration: Registration, registrationPolicy, authenticate: true });

// For register inside AuthContract.make's actions callback:
AuthContract.oauthRegister(sessions, Registration, {
  strategy: "registration",
  authenticate: true,
});
```

The first confirmed registration returns `Authenticated` or `PendingAuthentication`
according to your session policy. Provide the strategy's `SessionClaims` and session
services. Exact replays return `RegistrationAccepted` without credentials; changing
bound registration input conflicts.

SQL and Drizzle support this option. A replacement `RegistrationAuthority` must
advertise `authentication: "first-confirmed-registration"`; otherwise registration
fails with `OAuthMethodUnsupported`.

Registration and session issuance commit separately. The account can remain after
completion fails or its response is lost; recover with a fresh sign-in. External
provisioning must be idempotent for the supplied `requestId` and payload.

For linking, `OAuthActionEvidence.verify` supplies fresh authorization for the exact
action challenge. Session-based evidence uses verified private provenance through
`inspectInvocation`; public session metadata alone is insufficient.

Linking preserves existing sessions. Unlinking applies last-login-method checks and
the configured invalidation policy. `requireImmediateInvalidation` requires a zero
positive-cache window.

### Linked login inventory

`OAuth.makeAccounts` exposes `listLinkedAccounts` and `operations.List`.
`AuthContract.oauthListLinkedAccounts({ strategy })` adds the authenticated query to
your HTTP/client contract.

| Value  | Fields                                          |
| ------ | ----------------------------------------------- |
| Input  | `limit` (1–100), optional `cursor`              |
| Item   | `credentialId`, `provider`, `issuer`, `subject` |
| Result | `items`, optional continuation `cursor`         |

Use `credentialId` with `unlinkAccount`; use `listAccountConnections` for API grants.
Treat display strings as untrusted. Pass cursors unchanged and stop when no cursor
is returned. Concurrent changes can produce short pages or require a fresh listing.

Replacement persistence must recheck caller authority and metadata-access policy.
SQL/Drizzle mappings supply `metadataAccess` for application permissions.
`AuthAtom.make` refreshes named queries after named mutations; add reactivity keys
for your other queries. The [SQL lifecycle example](https://github.com/yielded-dev/auth/blob/main/examples/persistence-sql/src/oauth-lifecycle-consumer.ts)
shows pagination and unlinking.

### Connect an authenticated account

`Connected.begin` receives the flow ID, callback, Connect/Reconnect intent, return
target, and private action proof. Its confirmed result supplies an authorization
URL and privately delivers the browser binding. `Connected.complete` requires
fresh completion evidence before exchanging the code.

`Connected.disconnect` authorizes the exact subject and grant. These operations
manage provider access while preserving the application's authentication assurance.
Map request bindings and action proofs to private credential slots in the HTTP adapter.

### Runnable examples

Use `example:github` or `example:strava` in the
[Auth examples workspace](https://github.com/yielded-dev/auth/tree/main/examples/auth).
The examples document provider credentials, allowlisted identities, keys, callbacks,
and owned development storage.

Protectors use keyrings of `{ activeKeyId, keys: [{ id, material }] }`, where each
material is a redacted base64url encoding of 32 random bytes. Use separate keys for
sessions, transactions, and provider tokens, retaining old keys while records need them.

## Shared auth setup

Declare the OAuth actions in the shared contract:

```ts
const AuthApi = AuthContract.make("app/Auth", {
  claims: Schema.Struct({ displayName: Schema.String }),
  actions: (sessions) => ({
    signIn: AuthContract.oauthSignIn(),
    completeSignIn: AuthContract.oauthCompleteSignIn(sessions),
  }),
});
```

### Supply the services

Provide storage, claims, private transaction keys, and allowed return targets:

```ts
const OAuthLive = Layer.mergeAll(
  OAuthPersistenceLive,
  Layer.succeed(AppAuth.strategies.social.SessionClaims, { resolve: resolveOAuthClaims }),
  OAuth.OAuthTransactionProtector.layer(transactionKeys),
  OAuth.OAuthReturnTargets.exactRoutes(["/account"]),
);

export const Routes = AuthRoutes.pipe(
  Layer.provide(OAuthLive),
  Layer.provide(AuthDependencies),
  Layer.provide(Layer.merge(CryptoLive, FetchHttpClient.layer)),
);
```

The [runnable application](https://github.com/yielded-dev/auth/blob/main/examples/auth/src/oauth-application.ts)
supplies those application Layers. Native providers require HTTP and crypto services;
OpenID Connect also requires `Signature`. Protectors require `Aead` and `Crypto`.
Their Layers check for XChaCha20-Poly1305 support and fail with
`OAuthConfigurationError` (`reason: "crypto"`) when it is absent. On Workers,
provide `WorkerdPasswordlessServices.layer` from
`@yielded/auth/WorkerdPasswordlessServices` for HTTP and crypto without Wasm.
Use `WorkerdServices` when the application also hashes passwords; see
[runtime composition](./crypto.md#use-with-auth).
Keep the resulting Layer alive for the application's lifetime.

Flows default to five minutes; strategy `policy` controls their lifetime. Account
linking uses `OAuthLinkTransactionProtector`. Retained access also needs
`OAuthConnectedTransactionProtector` and `OAuthConnectedTokenProtector` with distinct
transaction and token keys.

### Identity imports

`OAuthPersistence.IdentityImports` from `@yielded/auth-persistence` is supplied by
composed SQL and Drizzle persistence when OAuth sign-in is enabled. Its
`importIdentity` accepts `OAuthPersistence.IdentityImport`: `moduleId`, `subjectId`,
`provider`, `issuer`, and `subject`. Decode migration data with that Schema and use
the module ID from the bound strategy's `persistence.moduleId`.

The existing subject must be active. The operation commits identity ownership,
the login credential and shared authority together, advances subject
`securityRevision`, and returns `{ credentialId, credentialRevision }`. Matching
active rows are an idempotent success without changing revisions. Another subject
or module, inactive credentials, inconsistent authority, invalid input, or storage
failure returns `OAuthUnavailable`. Imports do not provision subjects, retain
provider tokens, register users, or issue sessions.

Each call owns one transaction or D1 primary batch and rejects ambient transactions
and commit scopes. After a lost acknowledgement, retry the same input. Concurrent
conflicts may fail and can be retried after the competing import completes.

For application-owned persistence, `OAuthPersistence.identityKey(identity)` returns
the same stable key used by sign-in and requires Effect `Crypto`. It validates the
exact provider/issuer/subject tuple, rejects malformed Unicode with
`OAuthUnavailable`, and excludes the OAuth module from ownership. Use it inside
your own atomic import; the key alone does not create login authority. See the
[migration example](../guide/oauth#import-existing-identities).

## Customize callbacks

`Http` derives `/auth/{provider}/callback` from the origin and contract base path.
Callbacks use HTTPS, with HTTP loopback support for local development. Provider
endpoints use HTTPS.

```ts
const AuthRoutes = Http.layer(AppAuth, {
  origin,
  oauth: {
    providers,
    callbacks: { github: { path: "/login/github/return" } },
  },
});
```

| Customization              | API                                                                     |
| -------------------------- | ----------------------------------------------------------------------- |
| Multiple callbacks         | Array of `{ callbackId, path }`; select `callbackId` at sign-in         |
| Completion response        | `oauth.respond` or the callback's `respond`                             |
| Completion action          | `oauth.complete`                                                        |
| Existing HttpApi           | `Http.make` exposes `handlers(api)`, `callbackRoutes()`, and middleware |
| Application-owned callback | `GitHub.layer` or `OpenIdConnect.layer` with `redirectUri`              |

`respond` receives the encoded public result and flow/provider/callback IDs. It
returns an Effect response; the adapter owns cookie delivery. Custom completion
actions need `oauthCallback: true` and the request-binding credential mapping.

## Callback proxy

`OAuthProxy` supports sign-in and registration for registered local and preview
environments. Use native providers for linking and retained grants.

### Callback server

| `OAuthProxy.layer` option | Value                                                                  |
| ------------------------- | ---------------------------------------------------------------------- |
| `origin`                  | Public HTTPS origin                                                    |
| `path`                    | Route prefix; default `/oauth-proxy`                                   |
| `providers`               | Native provider declarations                                           |
| `environments`            | `{ id, secret, callbacks: [{ provider, callbackId, redirectUri }] }[]` |

Give each environment a separate 32-byte secret. Completion URLs match exactly;
only loopback completions may use HTTP with insecure host-only cookies.

Mount `OAuthProxy.routes` and register the provider callback. Supply a separate
protector keyring, an HTTP client, crypto, and `OAuthProxyPersistence.layer` with
SQLite, D1, or PostgreSQL. Apply its migration. Replicas share storage and keys.
Callbacks use the provider's declared GET query or POST form transport; Apple
first-consent `user` data reaches provider verification. App handoffs use GET.
The [proxy application](https://github.com/yielded-dev/auth/blob/main/examples/auth/src/oauth-proxy-application.ts)
shows the complete composition.

For Drizzle, use the driver's `OAuthProxyPersistence.table` and `layer`. Export the
table to Drizzle Kit and apply its migration before starting the server.

### App provider

| `OAuthProxy.provider` option | Value                             |
| ---------------------------- | --------------------------------- |
| `url`                        | Callback server's HTTPS base URL  |
| `environment`                | Registered environment ID         |
| `secret`                     | The environment's redacted secret |
| `issuer`                     | Expected provider issuer          |

The application retains its normal Auth services. Its HTTP client must avoid retries,
redirects, and ambient cookies. See [local and preview setup](../guide/oauth#local-and-preview-environments).

### Hosting and recovery

A trusted TLS proxy must preserve the public Host and replace forwarded-protocol
headers. Restrict the upstream listener to that proxy; custom `Server.handle` hosts
supply the public HTTPS URL. Exclude callback URLs and credentials from logs.

Attempts expire after five minutes. Completion handoffs are single-use and expire
within sixty seconds, bounded by the attempt. A timeout or lost response requires
a fresh sign-in. Retain keys while stored attempts need them; applications own
expired-row cleanup and ingress limits.

## Providers

| Integration        | Configure                                                              |
| ------------------ | ---------------------------------------------------------------------- |
| Apple              | [`Apple.provider`](../guide/apple)                                     |
| Atlassian          | [`Atlassian.provider`](../guide/atlassian)                             |
| Auth0              | [`Auth0.provider`](../guide/enterprise-oidc)                           |
| Cognito            | [`Cognito.provider`](../guide/enterprise-oidc)                         |
| Dropbox            | [`Dropbox.provider`](../guide/dropbox)                                 |
| Figma              | [`Figma.provider`](../guide/figma)                                     |
| GitHub             | [`GitHub.provider`](../guide/github)                                   |
| GitLab             | [`GitLab.provider`](../guide/gitlab), with optional self-hosted issuer |
| Google             | [`Google.provider`](../guide/google)                                   |
| Hugging Face       | [`HuggingFace.provider`](../guide/huggingface)                         |
| Keycloak           | [`Keycloak.provider`](../guide/enterprise-oidc)                        |
| Kick               | [`Kick.provider`](../guide/kick)                                       |
| LINE               | [`Line.provider`](../guide/line)                                       |
| Linear             | [`Linear.provider`](../guide/linear)                                   |
| Microsoft Entra ID | [`Microsoft.provider`](../guide/microsoft)                             |
| Notion             | [`Notion.provider`](../guide/notion)                                   |
| Okta               | [`Okta.provider`](../guide/enterprise-oidc)                            |
| Railway            | [`Railway.provider`](../guide/railway)                                 |
| Roblox             | [`Roblox.provider`](../guide/roblox)                                   |
| Slack              | [`Slack.provider`](../guide/slack)                                     |
| Vercel             | [`Vercel.provider`](../guide/vercel)                                   |
| X                  | [`X.provider`](../guide/x)                                             |
| Zitadel            | [`Zitadel.provider`](../guide/enterprise-oidc)                         |
| Zoom               | [`Zoom.provider`](../guide/zoom)                                       |
| GitHub API access  | `GitHub.accessProfile` plus provider `access`                          |
| Strava             | `Strava.provider`, with optional access profile                        |
| Other OAuth/OIDC   | `OpenIdConnect.provider`                                               |

`GitHub.accessProfile` defaults to `read:user`, rotating refresh tokens, provider
revocation, and thirty days of local refresh retention. `Strava.accessProfile`
requires scopes and supports local disconnection. Custom HTTP clients must reject
redirects and must not retry token exchanges.

### GitHub email permission

Set `verifiedPrimaryEmail: true` on a GitHub registration to request `user:email`
and select a verified primary address. It defaults to false and applies to
`GitHub.provider`, `GitHub.layer`, and `GitHub.gitHubOAuthAppProvider`.

| Behavior       | Contract                                                                                            |
| -------------- | --------------------------------------------------------------------------------------------------- |
| Result         | One verified primary address sets normalized `email` and `emailVerified`; otherwise both are absent |
| Identity       | Numeric GitHub ID; email never selects the account                                                  |
| `providerData` | The `/user` profile, including its separate nullable email                                          |
| Lookup limits  | 64 KiB per response, ten pages of 100 entries, bounded by the configured timeout                    |

Connected profiles must explicitly include `user:email` when lookup is enabled.
Refresh rechecks identity and preserves the stored email snapshot. Update the
configuration generation when changing this option. Failed or incomplete lookups
require a fresh sign-in.

### Generic providers

For plain OAuth, configure authorization/token endpoints and
`identitySource: { url, decodeIdentity }`. The decoder returns an Effect with the
stable subject and optional profile; its service requirements remain visible.

For retained access, declare `clientRegistrationId`, permission `profiles`,
`resourceIndicators`, `refreshExpiry`, and `revocation`. These contracts belong to
the provider configuration and are independent of sign-in scopes.

### OpenIdConnect defaults

| Setting                                | Default                               |
| -------------------------------------- | ------------------------------------- |
| `callbackId`                           | Provider key                          |
| `configurationGeneration` / `issuance` | `1` / `active`                        |
| `timeoutSeconds`                       | `10`, range 1–30                      |
| OIDC scopes                            | `["openid"]`                          |
| ID-token algorithms                    | Advertised RS256, PS256, ES256, EdDSA |
| Profile / UserInfo                     | `OidcUserProfile` / `id-token`        |
| Plain OAuth scopes                     | `[]`                                  |

`tokenEndpointAuthMethod` defaults to `client_secret_basic`.

Keep S256 PKCE and issuer-response validation enabled for providers that support
them. `pkceS256: false` and `responseIssuerMode: "unsupported"` are explicit provider
configuration choices. `userInfo: "merge"` fills missing ID-token claims after
checking the same subject; ID-token claims take precedence. Discovery accepts a
`{tenantid}` path segment when it matches the configured authority; verification
substitutes the signed `tid` and checks the selected signing key's issuer. A
concrete GUID authority discovered from that template keeps its own issuer, and
the signing key must still publish a matching issuer. Commercial `consumers` pins the
personal-account issuer. A tenant domain does not match that template. `common`
and `organizations` stay on it. Refresh against the template requires that
original `iss`.

Sign-in accepts per-request `prompt` and `loginHint`. Public clients use
`authentication: { method: "none", publicClient: true }`. Load secrets with
`Config.Redacted`; invalid settings fail Layer construction.

### Configuration rotation

Use `registrations` with one active entry and retired previous entries while flows
or grants reference them. Increase `configurationGeneration` when client settings
change and retain the old callbacks and keys for outstanding work. Moving a retained
permission profile to another registration also needs a new profile generation.

## Provider profiles

Verified identity is the provider/issuer/subject tuple. Optional profile fields are
display data; they do not authorize linking or local roles. Expose only needed claims
and treat profile strings and URLs as untrusted input.

Declare schemas by the provider keys used in `Http.make`:

```ts
const social = OAuth.make({
  profiles: {
    github: GitHub.GitHubUserProfile,
    google: Google.GoogleUserProfile,
  },
});
```

`SessionClaims.resolve` receives validated `providerData`, narrowed by `provider`.
A supplied map rejects undeclared providers or malformed data. Omit it for a generic
JSON profile, or provide your own service-free JSON-object Schema. Registration
exposes profile data on the server-side `OAuthRegistrationIntent`.

Missing claims stay absent. GitHub's nullable `/user.email` is separate from its
opt-in verified email fields. Google exposes verified `hd` for
[Workspace policy](../guide/google#identity-and-workspace-policy); GitLab can expose
`groups`, and Slack exposes its workspace and user identifiers for
[workspace policy](../guide/slack#identity-and-workspace-policy). LINE keeps
optional `amr`. Roblox keeps optional `type` and `created_at` and preserves the
trailing-slash issuer. Railway merges UserInfo because its ID token omits name,
email, and picture. `Microsoft.provider` keeps `oid` and `tid`. The durable
subject is `oid:tid` when the token issuer equals the configured authority, and
`tid:oid:tid` when it does not. `Apple.provider` decodes string
`email_verified` and `is_private_email` flags and merges the first-consent name.

Set `userInfo: "merge"` when an OIDC identity token omits needed profile claims.
Provider schemas describe the returned projection; applications choose permission
policy and account admission. Detailed signatures live beside the
[OAuth source](https://github.com/yielded-dev/auth/tree/main/packages/auth/src/oauth).
