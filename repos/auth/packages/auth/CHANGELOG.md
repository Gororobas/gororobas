# @yielded/auth

## 0.1.0-beta.18

### Patch Changes

- [#115](https://github.com/yielded-dev/auth/pull/115) [`9aaaa55`](https://github.com/yielded-dev/auth/commit/9aaaa55fff9e7bf7236036ba3fe8b84337eb3eae) Thanks [@danieljvdm](https://github.com/danieljvdm)! - Keep authentication Atom workflows compatible with `exactOptionalPropertyTypes`.

- [#110](https://github.com/yielded-dev/auth/pull/110) [`b904442`](https://github.com/yielded-dev/auth/commit/b904442510ec0b5412e4be81933a4e1523e16260) Thanks [@goknsh](https://github.com/goknsh)! - Support TypeScript consumers with `exactOptionalPropertyTypes` enabled, including the default session lifecycle actions.

- [#116](https://github.com/yielded-dev/auth/pull/116) [`a9009bf`](https://github.com/yielded-dev/auth/commit/a9009bf44c935946f7e8acde1a0073ef0239542a) Thanks [@danieljvdm](https://github.com/danieljvdm)! - Complete passkey ceremonies when persistence and application clocks differ while preserving bounded verification and authority-time expiry. Report invalid claim receipts with content-free diagnostics.

## 0.1.0-beta.17

### Patch Changes

- [#111](https://github.com/yielded-dev/auth/pull/111) [`2d6f361`](https://github.com/yielded-dev/auth/commit/2d6f361813bfa8523451120eddabcd801b83ab6d) Thanks [@danieljvdm](https://github.com/danieljvdm)! - Reject authentication completions from replaced account lifetimes before sending credentials or clearing the current account.

## 0.1.0-beta.16

### Patch Changes

- [#108](https://github.com/yielded-dev/auth/pull/108) [`a070c44`](https://github.com/yielded-dev/auth/commit/a070c44a4c86f79e2782119e74d7eae3ae064542) Thanks [@danieljvdm](https://github.com/danieljvdm)! - Keep authentication usable in React Native Metro bundles.

## 0.1.0-beta.15

### Minor Changes

- [#71](https://github.com/yielded-dev/auth/pull/71) [`ac61865`](https://github.com/yielded-dev/auth/commit/ac61865b374c03e2046cbfb3e8fb6a824893fb4e) Thanks [@danieljvdm](https://github.com/danieljvdm)! - Add system-browser sign-in for Electron and iOS apps with separate native sessions and configurable browser-session reuse. Keep Apple association setup optional and application-owned.

### Patch Changes

- [#73](https://github.com/yielded-dev/auth/pull/73) [`27126ab`](https://github.com/yielded-dev/auth/commit/27126ab493f71260416c623380ab3fcbe0ed8596) Thanks [@danieljvdm](https://github.com/danieljvdm)! - Prepare connected OAuth flows before verifying independent exact-action evidence, and resolve begin, callback and disconnect targets through private server services. **BEHAVIOR CHANGE:** call `prepareBegin` before `begin`, retain its private `connected-intent` credential and original command inputs, map credentials through Operation HTTP, and update custom persistence and transaction protectors for prepared flows and their connected envelopes.

- [#79](https://github.com/yielded-dev/auth/pull/79) [`1650b34`](https://github.com/yielded-dev/auth/commit/1650b34275537a11fe629bc0fd7d749c023a05f0) Thanks [@danieljvdm](https://github.com/danieljvdm)! - Queue overlapping password hashing calls with configurable bounded waiting and an acquisition deadline while retaining running work through cleanup.

- [#87](https://github.com/yielded-dev/auth/pull/87) [`d5e1f04`](https://github.com/yielded-dev/auth/commit/d5e1f0491732f30f10eea308667942be6aa51286) Thanks [@danieljvdm](https://github.com/danieljvdm)! - Reject unsafe browser cookie names, transport settings, and OAuth SameSite combinations at Layer acquisition.

  BEHAVIOR CHANGE: Prefix secure custom cookie names and prefixes with `__Host-`, use `SameSite=Lax` with OAuth, and use insecure cookies only on HTTP loopback origins.

- [#95](https://github.com/yielded-dev/auth/pull/95) [`877f025`](https://github.com/yielded-dev/auth/commit/877f0256f2f3760b6f909f41f0985ac311149000) Thanks [@danieljvdm](https://github.com/danieljvdm)! - Reject control characters and line separators in locale hints before proof delivery and custom rendering.

- [#94](https://github.com/yielded-dev/auth/pull/94) [`328b136`](https://github.com/yielded-dev/auth/commit/328b136ef2be59cc4763d861a26ae8af4e96b3cd) Thanks [@danieljvdm](https://github.com/danieljvdm)! - Protect HTTPS authorization consent cookies with the host prefix and root path.

  BEHAVIOR CHANGE: Read `cookieName` from the acquired authorization server `Service` and restart pending authorization flows after upgrading.

- [#83](https://github.com/yielded-dev/auth/pull/83) [`b5c46a1`](https://github.com/yielded-dev/auth/commit/b5c46a1e30a6f80c65a4a15f14354fc6c78e29eb) Thanks [@danieljvdm](https://github.com/danieljvdm)! - Deliver proofs through a built-in bounded worker so requests return without waiting for email or SMS provider acceptance. BEHAVIOR CHANGE: keep Auth's Layer alive across requests and use prepared receipts' `schedule` continuation; provide `Proofs.ProofDispatchScheduler.layerInline` only for trusted workflows that must await delivery.

- [#84](https://github.com/yielded-dev/auth/pull/84) [`841d4c8`](https://github.com/yielded-dev/auth/commit/841d4c809e282ad10214a6abac570b1b45a263b1) Thanks [@danieljvdm](https://github.com/danieljvdm)! - Protect active codes and reset links from other request attempts, charge only issued proofs, provide configurable request rate limiting by default, and expose `Adapter.makeStorageMappings` for adapter composition. BEHAVIOR CHANGE: supply `Proofs.ProofRequestContext` for non-HTTP calls and provide raw HTTP operation handlers, codecs, and callback services at `server.handle` invocation; standard Auth HTTP routes supply the caller automatically.

- [#92](https://github.com/yielded-dev/auth/pull/92) [`e4c0408`](https://github.com/yielded-dev/auth/commit/e4c04089921f2363ae325c7dd8c0f50e0685c860) Thanks [@danieljvdm](https://github.com/danieljvdm)! - Reject unsafe normalized provider display URLs while preserving sign-in for Strava athletes without a profile photo.

- [#96](https://github.com/yielded-dev/auth/pull/96) [`0140ee4`](https://github.com/yielded-dev/auth/commit/0140ee42ba96e49f7753bd8a9de3f8739576dd42) Thanks [@danieljvdm](https://github.com/danieljvdm)! - Bound compromised-password screening with a configurable deadline and fail closed with `PasswordCheckUnavailable` when it expires.

- [#88](https://github.com/yielded-dev/auth/pull/88) [`b2d82cb`](https://github.com/yielded-dev/auth/commit/b2d82cb59b2d19c2dad2dbc773ced8e6494955e4) Thanks [@danieljvdm](https://github.com/danieljvdm)! - Shorten the default stateless session lifetime to fifteen minutes.

  BEHAVIOR CHANGE: Retain an explicit `maxAge` or transitional `maximumIssuedAge` if previously issued longer-lived stateless tokens must remain usable.

- [#91](https://github.com/yielded-dev/auth/pull/91) [`5aa13b0`](https://github.com/yielded-dev/auth/commit/5aa13b0153d0be0613c3c51d7c442c719b1fe9bd) Thanks [@danieljvdm](https://github.com/danieljvdm)! - Bound Strava response bodies and profile fields, and return typed failures for malformed normalized grants.

- [#90](https://github.com/yielded-dev/auth/pull/90) [`ddeeb6d`](https://github.com/yielded-dev/auth/commit/ddeeb6d47d12b029afa33742cf93aab6e1fe9dcf) Thanks [@danieljvdm](https://github.com/danieljvdm)! - Charge rejected TOTP lost-factor resets against the pending authentication attempt budget.

## 0.1.0-beta.14

### Minor Changes

- [#61](https://github.com/yielded-dev/auth/pull/61) [`b0ef3d8`](https://github.com/yielded-dev/auth/commit/b0ef3d8ffcb1cebca66db115a2f6fd5f3cc4d5ab) Thanks [@danieljvdm](https://github.com/danieljvdm)! - Deliver Auth-rendered emails through an application-supplied `EmailDelivery` service, with built-in code/link templates and REST API and Alchemy examples. BEHAVIOR CHANGE: replace `Proofs.EmailProofDelivery` and `@yielded/auth-cloudflare` with that service, choose `Password.resetLink({ url })` or `Password.resetCode()` for password management, pass a URL to `Email.makeLink`, and read link fragments with `EmailDelivery.parseLinkFragment`.

## 0.1.0-beta.13

### Patch Changes

- [#59](https://github.com/yielded-dev/auth/pull/59) [`1c4df1c`](https://github.com/yielded-dev/auth/commit/1c4df1c52668d64b5e3d909cd03a025e88966e6a) Thanks [@danieljvdm](https://github.com/danieljvdm)! - Release password admission after attempt retention, page phone admission cleanup, and resolve an OAuth reservation when the provider issues no token.

  Keep request resources and post-commit hooks on the caller, report password outages as unavailable, and reuse each issuer's JWKS cache.

  BEHAVIOR CHANGE: Clear unresolved reservations left by earlier definite provider rejections if a cohort stays blocked. Password attempts need no reset.

- [#62](https://github.com/yielded-dev/auth/pull/62) [`1081d5b`](https://github.com/yielded-dev/auth/commit/1081d5b4003e9819e412c753273344ad00d47fc2) Thanks [@danieljvdm](https://github.com/danieljvdm)! - Keep password infrastructure outages distinct from credential rejection and identify invalid HTTP configuration components. Preserve delivery defects and cancellation through settlement without authorizing retries.

## 0.1.0-beta.12

### Minor Changes

- [#56](https://github.com/yielded-dev/auth/pull/56) [`67c8eff`](https://github.com/yielded-dev/auth/commit/67c8effd7b61ffb677e2a151d320ac308649fd12) Thanks [@danieljvdm](https://github.com/danieljvdm)! - Acquire database, transport, credential-store, and private-output dependencies through Effect services. BEHAVIOR CHANGE: provide each Drizzle driver's `Database` through `databaseLayer` and call its factories with mappings only; provide `Current*Sql` or `NativeDatabase` when acquiring shared Adapter services; select client stores by service key, provide `OperationHttpClient.Client` to `AuthAtom.makeLifetime(options)`, and supply OpenID fetch overrides through `FetchHttpClient.Fetch`.

### Patch Changes

- Align all public packages on a single beta version and release them together.

## 0.1.0-beta.11

### Minor Changes

- [#49](https://github.com/yielded-dev/auth/pull/49) [`b9967b8`](https://github.com/yielded-dev/auth/commit/b9967b8326404a72fc5378c268ae019c4999ef0f) Thanks [@danieljvdm](https://github.com/danieljvdm)! - Use Effect HttpClient Layers for auth transport and bound requests and response bodies with a configurable deadline.

  BEHAVIOR CHANGE: Use `AppClient.layerFetch` for Fetch defaults, or provide an HttpClient Layer to direct client acquisition and `AppClient.layer`; replace the `fetch` option with `FetchHttpClient.Fetch` at Layer construction. Atom defaults to `layerFetch`; pass a composed client as `{ layer: ClientLive }` to customize it. Timed-out requests fail with reason `"timeout"` after 30 seconds by default and must not be automatically retried.

- [#46](https://github.com/yielded-dev/auth/pull/46) [`75cd72c`](https://github.com/yielded-dev/auth/commit/75cd72c41a3fecdd5c8e84cc76f2dd534b7f2e78) Thanks [@danieljvdm](https://github.com/danieljvdm)! - Expose the remaining core modules as named namespaces from `@yielded/auth` while retaining their direct subpaths.

- [#51](https://github.com/yielded-dev/auth/pull/51) [`9392e50`](https://github.com/yielded-dev/auth/commit/9392e50f2b5ae7b275390fbbbd7a3100855441e4) Thanks [@danieljvdm](https://github.com/danieljvdm)! - Rename each sign-in strategy's claims service to `SessionClaims` and expose `subjectId` directly to account lookups.

  BEHAVIOR CHANGE: Replace `ClaimsForPassword`, `ClaimsForPasskey`, `ClaimsForEmail`, `ClaimsForPhone`, and `ClaimsForOAuth` with `SessionClaims`; implement `resolve({ subjectId, credential })`, or `resolve({ subjectId, credential, identity })` for OAuth.

- [#43](https://github.com/yielded-dev/auth/pull/43) [`4973533`](https://github.com/yielded-dev/auth/commit/49735334149d3d29a34542047a27ff6fffac9f7e) Thanks [@danieljvdm](https://github.com/danieljvdm)! - Consolidate password, email, and session authentication on `Auth.make` and the strategy modules, and remove the superseded workflows, HTTP/RPC integration, OAuth linking service, and store adapters. Replace Cloudflare OTP delivery with `layerEmailProofDelivery` for the shared proof engine.

  BEHAVIOR CHANGE: Replace `PasswordAuth`, `EmailOtp`, `AuthSession`, `Workflows`, `HttpServer`, and their support services with the current strategies, `Sessions`, `Http`, and `AuthPersistence`; use `OAuth.makeAccounts` / `OAuth.makeConnected` for provider linking and access. Retired challenge, registration, OAuth-state records, and session cookies are incompatible; reset only that development state and reauthenticate, and explicitly import application identities and credentials if keeping existing accounts.

- [#45](https://github.com/yielded-dev/auth/pull/45) [`156f0b3`](https://github.com/yielded-dev/auth/commit/156f0b3b01a60bb21f9984d6d464d05f73b79283) Thanks [@danieljvdm](https://github.com/danieljvdm)! - Retain provider access through `OAuth.make({ access: profile })` with shared Auth sessions, grant storage, refresh, and disconnect; remove OAuthApp and its separate persistence adapter.

  BEHAVIOR CHANGE: Reset development OAuthApp cookies/flows/grants and older connected token envelopes, then configure the shared sign-in and connected services; preserve account identities and outstanding reconciliation receipts.

### Patch Changes

- [#34](https://github.com/yielded-dev/auth/pull/34) [`bc112cc`](https://github.com/yielded-dev/auth/commit/bc112ccb9f063e374c40dc12d634efaba6812502) Thanks [@danieljvdm](https://github.com/danieljvdm)! - Add the standalone `@yielded/auth-react-native` package with `make()` and `layer` for iOS ES256 platform passkey registration, authentication, and capability checks with typed failures and redacted responses. Support content-free native diagnostics through the shared reporter and document associated-domain setup and interruption limits.

- [#43](https://github.com/yielded-dev/auth/pull/43) [`4973533`](https://github.com/yielded-dev/auth/commit/49735334149d3d29a34542047a27ff6fffac9f7e) Thanks [@danieljvdm](https://github.com/danieljvdm)! - Add a downloadable account starter with local email delivery, SQLite persistence, and a complete first-login guide.

- [#52](https://github.com/yielded-dev/auth/pull/52) [`4dbe837`](https://github.com/yielded-dev/auth/commit/4dbe837e23399e1e659c3b6eb7d2a041b5653de0) Thanks [@danieljvdm](https://github.com/danieljvdm)! - Require stable Effect and matching SQL drivers, and update Cloudflare integration to effect-cf 0.53. Support Drizzle RC4 with the temporary Drizzle patch CLI when adding Drizzle to an existing Bun app.

## 0.1.0-beta.10

### Minor Changes

- [#36](https://github.com/yielded-dev/auth/pull/36) [`1253846`](https://github.com/yielded-dev/auth/commit/12538461669ff3921f9a582b2ec4905f499db726) Thanks [@danieljvdm](https://github.com/danieljvdm)! - Move maintained cryptography into `@yielded/auth-crypto`, leaving Effect as core's only runtime peer and preserving stored credential and ciphertext formats. BEHAVIOR CHANGE: supply password hashing, TOTP cryptography, and OAuth protector Layers from the companion package; move `digest`/`randomId` and TOTP crypto helper imports there, and provide OAuthApp protectors instead of passing `transactionKeys`/`tokenKeys` options.

- [#35](https://github.com/yielded-dev/auth/pull/35) [`39bfccb`](https://github.com/yielded-dev/auth/commit/39bfccb93d9a14108b0973694e799f70f26a40fe) Thanks [@danieljvdm](https://github.com/danieljvdm)! - Move SimpleWebAuthn, OpenID Client, GitHub, and Cloudflare integrations into companion packages, removing their SDK dependencies from core. BEHAVIOR CHANGE: import them from `@yielded/auth-simplewebauthn/Browser` or `/Server` (using `make` and `layer`), `@yielded/auth-openid-client` or its `/Connected` and `/GitHub` entries, and `@yielded/auth-cloudflare`.

## 0.1.0-beta.9

### Minor Changes

- [#32](https://github.com/yielded-dev/auth/pull/32) [`85b10e7`](https://github.com/yielded-dev/auth/commit/85b10e7ee3c90d45721d7cbbc5125e30d8645167) Thanks [@danieljvdm](https://github.com/danieljvdm)! - Add OAuth authorization for registered MCP clients with browser consent, PKCE, scoped tokens, refresh rotation, and revocation. Protect Effect MCP routes with request authentication and persist grants through the standalone SQL adapter.

### Patch Changes

- [#30](https://github.com/yielded-dev/auth/pull/30) [`81b98eb`](https://github.com/yielded-dev/auth/commit/81b98eb6c7b046813d05a343697b460978f7d3df) Thanks [@danieljvdm](https://github.com/danieljvdm)! - Require Effect 4.0.0-rc.117, matching SQL drivers, and effect-cf 0.49.0 for Cloudflare integrations. Accept safe PostgreSQL `bigint` values in raw SQL mappings, release nested MySQL savepoints, and reject standalone persistence operations inside ambient libSQL transactions.

## 0.1.0-beta.8

### Minor Changes

- [#28](https://github.com/yielded-dev/auth/pull/28) [`9f88281`](https://github.com/yielded-dev/auth/commit/9f8828130424b45f8f74d462a4aac524e22511f2) Thanks [@danieljvdm](https://github.com/danieljvdm)! - Add managed OAuth sign-in that retains provider access and issues stateless application sessions, with GitHub and Strava adapters and SQL storage.
  Allow HTTP loopback callbacks for local OAuth development while requiring HTTPS for provider endpoints.

## 0.1.0-beta.7

### Minor Changes

- [#26](https://github.com/yielded-dev/auth/pull/26) [`d1f2799`](https://github.com/yielded-dev/auth/commit/d1f279964029ac25e7a58dc6fe8ca29025bd4bd3) Thanks [@danieljvdm](https://github.com/danieljvdm)! - Move SQL adapters into `@yielded/auth-persistence` and add managed schemas, opt-in Layers for Drizzle Kit migrations, and direct Effect SQL persistence for password registration and recovery, email verification, phone sign-in, and stateful sessions.

  BEHAVIOR CHANGE: Import Drizzle adapters from `@yielded/auth-persistence/drizzle/*`; both packages now release together at the same version.

- [#25](https://github.com/yielded-dev/auth/pull/25) [`5ccfe5a`](https://github.com/yielded-dev/auth/commit/5ccfe5a26e15351ff0b19b0199b858a9e22b889c) Thanks [@danieljvdm](https://github.com/danieljvdm)! - Default strategy constructors to behavior-only configuration and supply infrastructure through Layers. Add optional phone message rendering and an Effect HTTP adapter at `@yielded/auth/adapters/Twilio` requiring `TwilioConfig` and `HttpClient`.

  BEHAVIOR CHANGE: Supply `ProofKeys` for code verification and `SmsDelivery` for phone delivery instead of constructor keys and template labels. Enable phone lifecycle operations with `PhoneOtp.make({ lifecycle: true })` on the same strategy. Supply `PasskeyConfig` to both passkey strategies and the `layerSimpleWebAuthnPasskeyProtocol` Layer value. Preserve existing namespaces and key IDs; outstanding requests created with custom template labels require a fresh flow.

- [#23](https://github.com/yielded-dev/auth/pull/23) [`57427ef`](https://github.com/yielded-dev/auth/commit/57427ef4c086fa66a519c80944a24fa6c53d0885) Thanks [@danieljvdm](https://github.com/danieljvdm)! - Group shared definitions under `@yielded/auth/contracts` and server methods under `@yielded/auth/strategies`, preserving distinct names such as `PasskeyContract` and `Passkey`. Expose `Http` from the root and shorten passkey and TOTP contract constructors.

  BEHAVIOR CHANGE: Replace `makePasskeyContract`, `makePasskeyRegistrationContract`, and `makePasskeyManagementContract` with `PasskeyContract.make`, `.makeRegistration`, and `.makeManagement`; replace `makeTotpContract` with `TotpContract.make`.

### Patch Changes

- [#26](https://github.com/yielded-dev/auth/pull/26) [`d1f2799`](https://github.com/yielded-dev/auth/commit/d1f279964029ac25e7a58dc6fe8ca29025bd4bd3) Thanks [@danieljvdm](https://github.com/danieljvdm)! - Allow applications to configure the minimum new-password length with `NewPasswordCheck.layer`.

- [#26](https://github.com/yielded-dev/auth/pull/26) [`d1f2799`](https://github.com/yielded-dev/auth/commit/d1f279964029ac25e7a58dc6fe8ca29025bd4bd3) Thanks [@danieljvdm](https://github.com/danieljvdm)! - Add a runnable account example with application-owned file persistence, username sign-in, and replaceable registration, hashing, and authorization services.

- [#26](https://github.com/yielded-dev/auth/pull/26) [`d1f2799`](https://github.com/yielded-dev/auth/commit/d1f279964029ac25e7a58dc6fe8ca29025bd4bd3) Thanks [@danieljvdm](https://github.com/danieljvdm)! - Preserve existing sessions when confirming an already-bound, unverified email address, and let application policy accept its valid session evidence. Omit `invalidation` from that completion result; retain recent-authentication and invalidation requirements when adding or replacing an address.

- [#26](https://github.com/yielded-dev/auth/pull/26) [`d1f2799`](https://github.com/yielded-dev/auth/commit/d1f279964029ac25e7a58dc6fe8ca29025bd4bd3) Thanks [@danieljvdm](https://github.com/danieljvdm)! - Preserve existing authentication when adding a passkey and allow application-defined authorization freshness limits.

  BEHAVIOR CHANGE: `PasskeyEnrolled` and `PasskeyManagementPersistence.completeEnrollment` no longer include `invalidation`; custom persistence must preserve the subject security revision during enrollment.

- [#26](https://github.com/yielded-dev/auth/pull/26) [`d1f2799`](https://github.com/yielded-dev/auth/commit/d1f279964029ac25e7a58dc6fe8ca29025bd4bd3) Thanks [@danieljvdm](https://github.com/danieljvdm)! - Compose Drizzle passkey sign-in and management storage from the Auth definition, with opt-in managed tables and migrations.

  BEHAVIOR CHANGE: Return Effects from `write.policy.requirement` and `write.policy.remainingSignIn` in explicit passkey mappings, for example `() => Effect.succeed(requirement)`.

- [#26](https://github.com/yielded-dev/auth/pull/26) [`d1f2799`](https://github.com/yielded-dev/auth/commit/d1f279964029ac25e7a58dc6fe8ca29025bd4bd3) Thanks [@danieljvdm](https://github.com/danieljvdm)! - Expose `defaultProofPolicy` so applications can share proof expiry and resend timing with their UI.

## 0.1.0-beta.6

### Minor Changes

- [#21](https://github.com/yielded-dev/auth/pull/21) [`72a5ab0`](https://github.com/yielded-dev/auth/commit/72a5ab0f0c9d246eaf598122a6a3bbd38bf2b199) Thanks [@danieljvdm](https://github.com/danieljvdm)! - Mount auth with `AuthHttp.layer` and configure OAuth providers with generated callback routes, signed-cookie flow recovery, and callback customization.

  BEHAVIOR CHANGE: Use `GitHub.provider` in the HTTP provider map; use `gitHubOAuthAppProvider` for explicit provider entries in `OpenIdClient.layer`.

- [#22](https://github.com/yielded-dev/auth/pull/22) [`26cee88`](https://github.com/yielded-dev/auth/commit/26cee88102f72cd1483383720a5478234972326c) Thanks [@danieljvdm](https://github.com/danieljvdm)! - Start OAuth sign-in with only `provider` and `returnTarget`; generate attempt IDs on the server and select the configured default callback.

  BEHAVIOR CHANGE: Remove `flowId` and `commandId` from named sign-in calls. Custom `OAuthProtocol` implementations must resolve an omitted `callbackId` to the provider-named callback or the only configured callback, and reject ambiguous selection.

### Patch Changes

- [#19](https://github.com/yielded-dev/auth/pull/19) [`11140f3`](https://github.com/yielded-dev/auth/commit/11140f30362c523516cef727ff81cabcb613ccb3) Thanks [@danieljvdm](https://github.com/danieljvdm)! - Configure GitHub sign-in with `GitHub.layer({ clientId, clientSecret, redirectUri })` and compose hosts with `GitHub.provider` and `OpenIdClient.layer`. Apply the same callback, generation, issuance, and timeout defaults to connected accounts through `GitHub.layerConnected` and `OpenIdClientConnected.layer`, while retaining explicit rotation and provider security settings.

## 0.1.0-beta.5

### Patch Changes

- [#17](https://github.com/yielded-dev/auth/pull/17) [`098ad4a`](https://github.com/yielded-dev/auth/commit/098ad4a416e619a4ee9d44cbee36b5a924d6b595) Thanks [@danieljvdm](https://github.com/danieljvdm)! - Expose complete documented GitHub user profiles and standard OIDC user claims with typed schemas and normalized display fields. Pass the authenticated profile to registration authority and sign-in claims resolvers while keeping local identity and public session claims application-owned.

## 0.1.0-beta.4

### Patch Changes

- [#15](https://github.com/yielded-dev/auth/pull/15) [`85edaa4`](https://github.com/yielded-dev/auth/commit/85edaa44b4186d2aaf37c7007441ee9803c990cf) Thanks [@danieljvdm](https://github.com/danieljvdm)! - Validate GitHub OAuth callbacks against the required `https://github.com/login/oauth` issuer. BEHAVIOR CHANGE: restart pending flows and follow the OAuth guide to re-establish GitHub bindings or grants created with the old issuer; other providers and application data are unaffected.

## 0.1.0-beta.3

### Patch Changes

- [#12](https://github.com/yielded-dev/auth/pull/12) [`0f7bf1a`](https://github.com/yielded-dev/auth/commit/0f7bf1abe572a6b271b74c92173ecde906618287) Thanks [@danieljvdm](https://github.com/danieljvdm)! - Configure GitHub OAuth App sign-in alongside generic OAuth/OIDC providers in one protocol layer using `gitHubOAuthAppProvider`, preserving GitHub response handling and captured provider generations.

## 0.1.0-beta.2

### Patch Changes

- [#9](https://github.com/yielded-dev/auth/pull/9) [`4e241f0`](https://github.com/yielded-dev/auth/commit/4e241f0dd31a4f857e5d3a17043c17139d540e8f) Thanks [@danieljvdm](https://github.com/danieljvdm)! - Point package source and issue links to the `yielded-dev/auth` repository. Link the package homepage to `yielded.dev/auth`.

## 0.1.0-beta.1

### Minor Changes

- [#5](https://github.com/yielded-dev/auth/pull/5) [`32be91d`](https://github.com/yielded-dev/auth/commit/32be91d23f8b17e8eff479a4ed2456b1d8fdc373) Thanks [@danieljvdm](https://github.com/danieljvdm)! - Define shared auth contracts for request-aware local services, named HTTP clients, and automatically synchronized Effect Atom state. Compose auth routes with existing HttpApi groups and use importable Effect Atom queries and mutations with scoped session hydration and shared invalidation.

  BEHAVIOR CHANGE: Create service definitions with `Auth.make(contractOrId, options)` and `Client.make(contract, options)`; construct instances with their `.make` Effects. Include `credentials` in manually provided `AuthRequest` values. Mount shared actions with `http.routes()`; session lookup and required-session lookup use GET; sign-out and renewal use POST at their named `/auth` paths. Apply `http.protect` to custom credential-producing HTTP workflows. Set `basePath` in `AuthContract.make` to change their shared prefix.

- [`f8916bd`](https://github.com/yielded-dev/auth/commit/f8916bdb4e13264f332ddb036f3cd9d8ba0bb95c) Thanks [@danieljvdm](https://github.com/danieljvdm)! - Publish Yielded Auth as `@yielded/auth` with the same root namespaces and direct module exports. Use `@yielded/auth` and `@yielded/auth/<Module>` in application imports.

### Patch Changes

- [#2](https://github.com/yielded-dev/auth/pull/2) [`d85cc73`](https://github.com/yielded-dev/auth/commit/d85cc73b18c5c4939cf7466a76277df203192551) Thanks [@danieljvdm](https://github.com/danieljvdm)! - Preserve module boundaries and native root namespaces so consumers can tree-shake unused implementations. Expose SessionContract from the package root alongside the other shared contracts.
