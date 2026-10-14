# @yielded/auth

## 0.1.0-beta.39

### Patch Changes

- Updated dependencies []:
  - @yielded/crypto@0.1.0-beta.39
  - @yielded/jose@0.1.0-beta.39
  - @yielded/oauth@0.1.0-beta.39

## 0.1.0-beta.38

### Patch Changes

- [#234](https://github.com/yielded-dev/auth/pull/234) [`2186f4f`](https://github.com/yielded-dev/auth/commit/2186f4f649c72d3d37be7fcf25e10f097a4fcb04) Thanks [@danieljvdm](https://github.com/danieljvdm)! - Provide `WorkerdPasswordlessServices.layer` for Workers authentication without Argon2 Wasm or Node.js compatibility. Reject OAuth protector construction when the supplied AEAD service lacks XChaCha20-Poly1305 support.

  BEHAVIOR CHANGE: Implement `supports(algorithm)` on custom `Aead` services.

- Updated dependencies [[`2186f4f`](https://github.com/yielded-dev/auth/commit/2186f4f649c72d3d37be7fcf25e10f097a4fcb04)]:
  - @yielded/crypto@0.1.0-beta.38
  - @yielded/jose@0.1.0-beta.38
  - @yielded/oauth@0.1.0-beta.38

## 0.1.0-beta.37

### Patch Changes

- [#232](https://github.com/yielded-dev/auth/pull/232) [`a37f2c9`](https://github.com/yielded-dev/auth/commit/a37f2c956afd791294329108e6d22b764958061f) Thanks [@danieljvdm](https://github.com/danieljvdm)! - Provide Cloudflare Workers runtime dependencies once with `WorkerdServices.layer` from `@yielded/auth/WorkerdServices`, including password hashing, cryptography, bounded KDF admission, and a Fetch HTTP client.
- Updated dependencies []:
  - @yielded/crypto@0.1.0-beta.37
  - @yielded/jose@0.1.0-beta.37
  - @yielded/oauth@0.1.0-beta.37

## 0.1.0-beta.36

### Patch Changes

- Updated dependencies []:
  - @yielded/crypto@0.1.0-beta.36
  - @yielded/jose@0.1.0-beta.36
  - @yielded/oauth@0.1.0-beta.36

## 0.1.0-beta.35

### Patch Changes

- [#219](https://github.com/yielded-dev/auth/pull/219) [`b97748f`](https://github.com/yielded-dev/auth/commit/b97748f6f655d836107184a5f982ea75abc0ea98) Thanks [@danieljvdm](https://github.com/danieljvdm)! - Reduce named action dispatch overhead while preserving invocation-local services and operation validation.

- [#226](https://github.com/yielded-dev/auth/pull/226) [`1f648ae`](https://github.com/yielded-dev/auth/commit/1f648ae827a81fd3d17da28d93548245a43e2538) Thanks [@danieljvdm](https://github.com/danieljvdm)! - Allow OAuth client metadata and JWKS discovery on Cloudflare Workers while continuing to reject redirects.

- [#223](https://github.com/yielded-dev/auth/pull/223) [`172e9d1`](https://github.com/yielded-dev/auth/commit/172e9d1f975190e8015d7d583b83f5ef7e6d925b) Thanks [@danieljvdm](https://github.com/danieljvdm)! - Scan cookie names once per HTTP admission while preserving rejection of ambiguous credentials and optional session-cache misses.

- [#206](https://github.com/yielded-dev/auth/pull/206) [`5875575`](https://github.com/yielded-dev/auth/commit/5875575c9c62f6d755734f3874e13ca654c8d3bd) Thanks [@danieljvdm](https://github.com/danieljvdm)! - Reuse one scoped HMAC key while checking a TOTP code across its allowed time window.

- [#212](https://github.com/yielded-dev/auth/pull/212) [`7f47bce`](https://github.com/yielded-dev/auth/commit/7f47bce67b8e0c7a49a6f2421cf09667a4b5f044) Thanks [@danieljvdm](https://github.com/danieljvdm)! - Reduce repeated session projection work when reading an already verified request session.

- [#209](https://github.com/yielded-dev/auth/pull/209) [`948a3f1`](https://github.com/yielded-dev/auth/commit/948a3f12295b59c0bc560941edbbef59cc0b77b9) Thanks [@danieljvdm](https://github.com/danieljvdm)! - Reuse local public-key resolvers for OAuth client assertions within each configured key generation. Expose `Jwks.makeLocal` to retain a validated local resolver without building a Layer.

- [#205](https://github.com/yielded-dev/auth/pull/205) [`9bc7083`](https://github.com/yielded-dev/auth/commit/9bc7083ced9992ed428c61f45163217b09857079) Thanks [@danieljvdm](https://github.com/danieljvdm)! - Reuse the fixed HTTP request decoder across operations to avoid rebuilding its schema for each request.

- [#220](https://github.com/yielded-dev/auth/pull/220) [`b86c41e`](https://github.com/yielded-dev/auth/commit/b86c41e562a9f623d2f3f7f6fa6d9a9835b5fbb8) Thanks [@danieljvdm](https://github.com/danieljvdm)! - Reuse parsed private keys for provider client assertions within each configured generation and wipe them when its Scope closes.

- [#216](https://github.com/yielded-dev/auth/pull/216) [`e368c21`](https://github.com/yielded-dev/auth/commit/e368c21e51bea214efb41158aec4585c8db509a2) Thanks [@danieljvdm](https://github.com/danieljvdm)! - Reuse the existing shared session contract when constructing an Auth service.

- [#213](https://github.com/yielded-dev/auth/pull/213) [`1a65155`](https://github.com/yielded-dev/auth/commit/1a65155dec67dd4cf6d114132759e93e758d01db) Thanks [@danieljvdm](https://github.com/danieljvdm)! - Reduce allocation and capacity-check overhead in the bounded process-local rate limiter.

- [#222](https://github.com/yielded-dev/auth/pull/222) [`56cef27`](https://github.com/yielded-dev/auth/commit/56cef272b938592ea8e05409ce040f3ec4305c74) Thanks [@danieljvdm](https://github.com/danieljvdm)! - Reuse equivalent OIDC discovery responses while initializing sign-in and retained-access protocols, preserving separate client and verification policies.

- [#208](https://github.com/yielded-dev/auth/pull/208) [`fbc58e3`](https://github.com/yielded-dev/auth/commit/fbc58e3343b140743e24c7a061bcf38985c45383) Thanks [@danieljvdm](https://github.com/danieljvdm)! - Reduce HTTP transport tracing overhead while retaining public request and operation spans. Remove internal body-reading, command-delivery, and admission helper spans and their function stack enrichment.

- [#210](https://github.com/yielded-dev/auth/pull/210) [`fd5d9e6`](https://github.com/yielded-dev/auth/commit/fd5d9e68803180acc9566317f4578a9f55b30f84) Thanks [@danieljvdm](https://github.com/danieljvdm)! - Reuse OAuth snapshot codecs while preserving validation, detached values, and recursive freezing.
- Updated dependencies [[`0a3254c`](https://github.com/yielded-dev/auth/commit/0a3254cfb5c4633d88a81aadb263a0efed7b3d85), [`b7f695b`](https://github.com/yielded-dev/auth/commit/b7f695bc71991164f0935ed7781a1898d9905aaf), [`948a3f1`](https://github.com/yielded-dev/auth/commit/948a3f12295b59c0bc560941edbbef59cc0b77b9), [`948a3f1`](https://github.com/yielded-dev/auth/commit/948a3f12295b59c0bc560941edbbef59cc0b77b9), [`bdc849c`](https://github.com/yielded-dev/auth/commit/bdc849cde2c652d27f59d60f2a120c9873ce62c0)]:
  - @yielded/jose@0.1.0-beta.35
  - @yielded/crypto@0.1.0-beta.35
  - @yielded/oauth@0.1.0-beta.35

## 0.1.0-beta.34

### Patch Changes

- [#203](https://github.com/yielded-dev/auth/pull/203) [`5264de7`](https://github.com/yielded-dev/auth/commit/5264de78aee570c82718b2841ec38ea17544fa3e) Thanks [@danieljvdm](https://github.com/danieljvdm)! - Support Effect 4.0.3 across authentication workflows and companion packages. Require Effect 4.0.3 or later.
- Updated dependencies [[`5264de7`](https://github.com/yielded-dev/auth/commit/5264de78aee570c82718b2841ec38ea17544fa3e)]:
  - @yielded/crypto@0.1.0-beta.34
  - @yielded/jose@0.1.0-beta.34
  - @yielded/oauth@0.1.0-beta.34

## 0.1.0-beta.33

### Patch Changes

- [#181](https://github.com/yielded-dev/auth/pull/181) [`b9b43e2`](https://github.com/yielded-dev/auth/commit/b9b43e24f6fedda4168cfb65b081c296ffd9233f) Thanks [@danieljvdm](https://github.com/danieljvdm)! - Add `Apple.provider` for Sign in with Apple, with ES256 client-secret JWTs from a `.p8` key. Accept form_post callbacks and first-consent names through direct routes with a `SameSite=None; Secure` request-binding cookie and through the callback proxy.

  BEHAVIOR CHANGE: Custom `Signature` services must implement `decodePrivateKey`.

- [#176](https://github.com/yielded-dev/auth/pull/176) [`c9787f7`](https://github.com/yielded-dev/auth/commit/c9787f731dc64870f0ace15fa4e6edd3a3f13ff8) Thanks [@danieljvdm](https://github.com/danieljvdm)! - Add Okta, Auth0, Keycloak, Zitadel, and Cognito OpenID presets that build each customer's issuer from typed tenant fields. Cognito supplies the missing PKCE advertisement for user-pool issuers, and Auth0 follows the tenant's authorization response issuer setting.

- [#180](https://github.com/yielded-dev/auth/pull/180) [`0ad3e4c`](https://github.com/yielded-dev/auth/commit/0ad3e4cc67a954e3a2f20aae9491e1608fd5ccea) Thanks [@danieljvdm](https://github.com/danieljvdm)! - Add Linear, Dropbox, and Notion sign-in. Plain OAuth identity can come from a GET, a POST, or the token response, and JSON token requests reject repeated parameter names.

- [#175](https://github.com/yielded-dev/auth/pull/175) [`2326161`](https://github.com/yielded-dev/auth/commit/232616128ad88418c375de9256614d37053c76e2) Thanks [@danieljvdm](https://github.com/danieljvdm)! - Add LINE, Roblox, and Railway OpenID sign-in. LINE verifies web-login HS256 ID tokens with the channel secret, Roblox keeps its trailing-slash issuer, and Railway merges UserInfo from its published `/oauth` discovery document.

- [#178](https://github.com/yielded-dev/auth/pull/178) [`881f94d`](https://github.com/yielded-dev/auth/commit/881f94d31c9dfd3119bb2544925f9ee1d8b78368) Thanks [@danieljvdm](https://github.com/danieljvdm)! - Add `Microsoft.provider` for Entra ID sign-in, with `oid:tid` subjects and a PKCE supplement for the v2.0 endpoints. Accept `{tenantid}` discovery issuers by substituting the verified `tid` and checking the selected signing key's issuer, including after a concrete tenant is pinned. Commercial `consumers` keeps the personal-account issuer, and a tenant domain is not accepted from that template. Refresh against the template requires the original `iss`.

- [#177](https://github.com/yielded-dev/auth/pull/177) [`0ee8f41`](https://github.com/yielded-dev/auth/commit/0ee8f415dc72d5ab750fb6813d783840c8ec65c5) Thanks [@danieljvdm](https://github.com/danieljvdm)! - Add X, Figma, Atlassian, and Kick sign-in. Each preset uses authorization-code PKCE and one identity GET.
- Updated dependencies [[`b9b43e2`](https://github.com/yielded-dev/auth/commit/b9b43e24f6fedda4168cfb65b081c296ffd9233f), [`0ad3e4c`](https://github.com/yielded-dev/auth/commit/0ad3e4cc67a954e3a2f20aae9491e1608fd5ccea), [`2326161`](https://github.com/yielded-dev/auth/commit/232616128ad88418c375de9256614d37053c76e2), [`881f94d`](https://github.com/yielded-dev/auth/commit/881f94d31c9dfd3119bb2544925f9ee1d8b78368)]:
  - @yielded/oauth@0.1.0-beta.33
  - @yielded/jose@0.1.0-beta.33
  - @yielded/crypto@0.1.0-beta.33

## 0.1.0-beta.32

### Minor Changes

- [#190](https://github.com/yielded-dev/auth/pull/190) [`a33138f`](https://github.com/yielded-dev/auth/commit/a33138fd6fb853fd6763b3618bd93e3204f94dc2) Thanks [@danieljvdm](https://github.com/danieljvdm)! - Add opt-in authentication after the first confirmed OAuth registration, including pending MFA, while keeping default registration and every replay metadata-only.

### Patch Changes

- [#185](https://github.com/yielded-dev/auth/pull/185) [`32b9eb9`](https://github.com/yielded-dev/auth/commit/32b9eb9aad6945bc6065ca7c33857fd7d7627a32) Thanks [@danieljvdm](https://github.com/danieljvdm)! - Add opt-in GitHub verified-primary email lookup without broadening default sign-in consent. Clarify main-only provider APIs and the fresh sign-in required after OAuth registration.

- [#189](https://github.com/yielded-dev/auth/pull/189) [`93eab41`](https://github.com/yielded-dev/auth/commit/93eab4198349a9cfbfec73e66ca601701cd7c685) Thanks [@danieljvdm](https://github.com/danieljvdm)! - Apply one opt-in future-clock policy across Auth, SQL sessions, and protected password and passkey actions while preserving strict freshness and expiry. **BEHAVIOR CHANGE:** Custom `AuthenticationAuthority.approve` implementations must validate the prepared `issuedAt` supplied by Auth.

- [#195](https://github.com/yielded-dev/auth/pull/195) [`4c74ac6`](https://github.com/yielded-dev/auth/commit/4c74ac6325d14e4681c989acaa23760fe746728d) Thanks [@danieljvdm](https://github.com/danieljvdm)! - Support composed managed OAuth sign-in and retained provider grants across the PostgreSQL and SQLite adapters, including D1. Allow OAuth-only compositions to use stateless sessions.

- [#191](https://github.com/yielded-dev/auth/pull/191) [`dfdc622`](https://github.com/yielded-dev/auth/commit/dfdc622a346622474ca9a34f6215ee070cd718fc) Thanks [@danieljvdm](https://github.com/danieljvdm)! - Add opt-in, sanitized Debug diagnostics and preserve request logging and tracing without changing authentication outcomes or retry guarantees.
- Updated dependencies []:
  - @yielded/crypto@0.1.0-beta.32
  - @yielded/jose@0.1.0-beta.32
  - @yielded/oauth@0.1.0-beta.32

## 0.1.0-beta.31

### Minor Changes

- [#187](https://github.com/yielded-dev/auth/pull/187) [`b5388b6`](https://github.com/yielded-dev/auth/commit/b5388b6e4bc0ebadf10e97367c09638ba17724e0) Thanks [@danieljvdm](https://github.com/danieljvdm)! - Accelerate Argon2id on Workers with bundled Wasm and add native scrypt on Node, Bun, and Workers. Select `defaultScryptPasswordHashingConfig` to migrate passwords to scrypt on successful sign-in; **BEHAVIOR CHANGE:** custom `Kdf` services must provide `scrypt`.

### Patch Changes

- [#184](https://github.com/yielded-dev/auth/pull/184) [`759c6e7`](https://github.com/yielded-dev/auth/commit/759c6e73612d90a11d092f3c30cf8ddc3a1c0cdc) Thanks [@danieljvdm](https://github.com/danieljvdm)! - Allow exact HTTP loopback trusted origins for local, host-only deployments with insecure cookies. Document credentialed CORS and Auth service composition for browser, RPC, and WebSocket hosts.

- [#171](https://github.com/yielded-dev/auth/pull/171) [`a1c5555`](https://github.com/yielded-dev/auth/commit/a1c555586cdf5415530ea71e08b25da3063772a3) Thanks [@danieljvdm](https://github.com/danieljvdm)! - Let OAuth and OpenID presets carry their own profile schema, accept advertised ES256, PS256 and EdDSA ID tokens, and opt out of PKCE. Sign-in begin accepts prompt and loginHint, and OIDC can merge UserInfo into ID-token claims. EdDSA hash claims use SHA-512. Connected refresh keeps the stored identity and does not re-decode UserInfo-only profile fields.

- [#179](https://github.com/yielded-dev/auth/pull/179) [`dcf1691`](https://github.com/yielded-dev/auth/commit/dcf16913160299793e4ef460a41d390950661a7a) Thanks [@danieljvdm](https://github.com/danieljvdm)! - Add Google, GitLab, Hugging Face, Vercel, and Zoom OpenID presets. Google sends `prompt=select_account` and `access_type=offline` and types the `hd` Workspace claim. GitLab accepts a self-hosted issuer.
- Updated dependencies [[`b5388b6`](https://github.com/yielded-dev/auth/commit/b5388b6e4bc0ebadf10e97367c09638ba17724e0), [`a1c5555`](https://github.com/yielded-dev/auth/commit/a1c555586cdf5415530ea71e08b25da3063772a3)]:
  - @yielded/crypto@0.1.0-beta.31
  - @yielded/oauth@0.1.0-beta.31
  - @yielded/jose@0.1.0-beta.31

## 0.1.0-beta.30

### Minor Changes

- [#161](https://github.com/yielded-dev/auth/pull/161) [`989f88c`](https://github.com/yielded-dev/auth/commit/989f88ca1a7f46ec73702330827c555b776d8206) Thanks [@danieljvdm](https://github.com/danieljvdm)! - Expose paginated linked OAuth login identities through Auth, HTTP clients, and Effect Atom queries. Add `metadataAccess` to SQL/Drizzle account mappings and `list` to replacement account persistence services.

- [#167](https://github.com/yielded-dev/auth/pull/167) [`8e5b5d1`](https://github.com/yielded-dev/auth/commit/8e5b5d173f82c98ad1fcd644b9d18d91c59d9a43) Thanks [@danieljvdm](https://github.com/danieljvdm)! - Add a static-client OpenID authorization-code profile with signed identity tokens, UserInfo, current-session authorization and replaceable consent rendering.

  Allow applications to supply prior OpenID consent for exact clients and scopes while preserving explicit consent and account selection.

### Patch Changes

- Updated dependencies [[`dd0a495`](https://github.com/yielded-dev/auth/commit/dd0a4951597c230e6e7ef11725c626ce8b80318b)]:
  - @yielded/crypto@0.1.0-beta.30
  - @yielded/jose@0.1.0-beta.30
  - @yielded/oauth@0.1.0-beta.30

## 0.1.0-beta.29

### Minor Changes

- [#165](https://github.com/yielded-dev/auth/pull/165) [`167f725`](https://github.com/yielded-dev/auth/commit/167f7256fa634430f442eb6f1e0a04595c605370) Thanks [@danieljvdm](https://github.com/danieljvdm)! - Add `keyValueRateLimiterStore` to `@yielded/auth/Persistence`, which keeps auth rate limits in any Effect `KeyValueStore`, such as Workers KV. BEHAVIOR CHANGE: action, global message, and passkey module budgets now always stay per instance; a supplied store holds only identifier, subject, target, and network buckets.

### Patch Changes

- Updated dependencies [[`536a76b`](https://github.com/yielded-dev/auth/commit/536a76b6cd7d653b456adfcf0f81d275cda77660)]:
  - @yielded/crypto@0.1.0-beta.29
  - @yielded/jose@0.1.0-beta.29
  - @yielded/oauth@0.1.0-beta.29

## 0.1.0-beta.28

### Patch Changes

- [#157](https://github.com/yielded-dev/auth/pull/157) [`7a5b241`](https://github.com/yielded-dev/auth/commit/7a5b241f18f976271142e39fc523ba266ec4bbb0) Thanks [@danieljvdm](https://github.com/danieljvdm)! - Avoid duplicate requests when a named query discovers the account, including session reads with or without an SSR seed. Preserve account cleanup and forward explicit refreshes of seeded sessions.
- Updated dependencies []:
  - @yielded/crypto@0.1.0-beta.28
  - @yielded/jose@0.1.0-beta.28
  - @yielded/oauth@0.1.0-beta.28

## 0.1.0-beta.27

### Patch Changes

- Updated dependencies []:
  - @yielded/crypto@0.1.0-beta.27
  - @yielded/jose@0.1.0-beta.27
  - @yielded/oauth@0.1.0-beta.27

## 0.1.0-beta.26

### Minor Changes

- [#148](https://github.com/yielded-dev/auth/pull/148) [`dcdce5a`](https://github.com/yielded-dev/auth/commit/dcdce5a7c23647b58206974bdc4101b45d0df37f) Thanks [@danieljvdm](https://github.com/danieljvdm)! - BEHAVIOR CHANGE: Consume OAuth callbacks once, confirm account links only at begin, and preserve existing sessions when linking. Replace prepared connections and durable unlink replay with direct operations; reset development OAuth flow, registration-intent, connected-grant, and revocation state and update the explicit mappings.

- [#148](https://github.com/yielded-dev/auth/pull/148) [`dcdce5a`](https://github.com/yielded-dev/auth/commit/dcdce5a7c23647b58206974bdc4101b45d0df37f) Thanks [@danieljvdm](https://github.com/danieljvdm)! - Replace passkey claim leases with single-use challenge consumption, retain enrollment authorization from begin, allow in-progress ceremonies to finish with their selected RP profile during rolling deploys, and apply immediate-invalidation requirements only to removal.

  BEHAVIOR CHANGE: Remove enrollment completion action proofs, passkey generations, and mutation replay flags; replace `PasskeyCleanupResult` with `CleanupResult` from `@yielded/auth/Persistence`, reset development passkey tables and profile records, and supply a shared Effect limiter for coordinated limits across replicas.

- [#148](https://github.com/yielded-dev/auth/pull/148) [`dcdce5a`](https://github.com/yielded-dev/auth/commit/dcdce5a7c23647b58206974bdc4101b45d0df37f) Thanks [@danieljvdm](https://github.com/danieljvdm)! - Remove prepared password intents, pending registration, and unused hook composition APIs; use synchronous idempotent provisioning and recent session step-up for password changes.

  BEHAVIOR CHANGE: Replace `PasswordKdfAdmission` with `KdfAdmission` from `@yielded/crypto/KdfAdmission`, complete provisioning before returning, and use passkey sign-in followed by a password change when recovering with a passkey. Remove hook outbox/deferred options and the second argument to `coordinateCommit`; provide a shared Effect rate limiter to coordinate password attempt budgets across replicas.

### Patch Changes

- [#149](https://github.com/yielded-dev/auth/pull/149) [`03b57e3`](https://github.com/yielded-dev/auth/commit/03b57e3186eb3bed3e4207ae7cf1a82f9ebbc349) Thanks [@danieljvdm](https://github.com/danieljvdm)! - Complete email, password recovery, and phone flows with the original proof reference and secret; reissue through the request operation after cooldown, with fresh per-code guess counts and one local delivery. BEHAVIOR CHANGE: configure shared token-bucket stores across replicas and reset the replaced development proof, command, registration-receipt, and phone identifier storage; retired phone numbers remain occupied. Call `SmsProofDelivery.layer(send)` without a vendor policy (`ProofVendorPolicy` and `ProofDeliveryStatus` are removed), drop `requestId`, `fingerprint`, `replayLifetimeMillis` and `cleanup` from custom `PhoneAdmission` services, and remove the `sendCount` column from proof mappings.

- [#149](https://github.com/yielded-dev/auth/pull/149) [`03b57e3`](https://github.com/yielded-dev/auth/commit/03b57e3186eb3bed3e4207ae7cf1a82f9ebbc349) Thanks [@danieljvdm](https://github.com/danieljvdm)! - Carry complete active factor revisions through password lookup and action authorization without adding factor proofs. BEHAVIOR CHANGE: custom password snapshots and authentication-authority captures must return the full vector, treating requested credential IDs as required anchors even when the list is empty.

- [#151](https://github.com/yielded-dev/auth/pull/151) [`821d0a2`](https://github.com/yielded-dev/auth/commit/821d0a222aca754d1b3e2928dab0b6b9cd23b0d1) Thanks [@danieljvdm](https://github.com/danieljvdm)! - Reuse authoritative session and factor snapshots within a request, preserve fresh step-up assurance without extending absolute expiry, and keep existing sessions when regenerating recovery codes. BEHAVIOR CHANGE: reset development session and pending state, map current subject policy and shared pending kinds, implement bounded browser-login cleanup, and replace removed strategy verification, preparation, row-version and flow-deduplication contracts.

- [#152](https://github.com/yielded-dev/auth/pull/152) [`9b6ffb6`](https://github.com/yielded-dev/auth/commit/9b6ffb62679862890cbbb6604bdada5827c00400) Thanks [@danieljvdm](https://github.com/danieljvdm)! - Reuse the captured OAuth grant for token-use authorization and conditional refresh claims. BEHAVIOR CHANGE: update custom use authorities to accept the supplied snapshot, custom persistence to claim the exact stored grant, and OAuth mappings to remove `decodeActionRequirement`.

- [#146](https://github.com/yielded-dev/auth/pull/146) [`730d296`](https://github.com/yielded-dev/auth/commit/730d296952af8473be2701eb33b404a8f02f9429) Thanks [@danieljvdm](https://github.com/danieljvdm)! - Keep cached session reads database-free by deferring composed SQL persistence initialization until its first storage operation. Start cookie caching automatically for existing browser sessions after enabling `cacheFor`, without requiring another sign-in or renewal.
- Updated dependencies []:
  - @yielded/crypto@0.1.0-beta.26
  - @yielded/jose@0.1.0-beta.26
  - @yielded/oauth@0.1.0-beta.26

## 0.1.0-beta.25

### Patch Changes

- [#143](https://github.com/yielded-dev/auth/pull/143) [`5d5f461`](https://github.com/yielded-dev/auth/commit/5d5f461a17587c1bde74d9ed667efe4bd85c888d) Thanks [@danieljvdm](https://github.com/danieljvdm)! - Add opt-in stateful session cookie caching with bounded staleness, authoritative fresh reads, and diagnostics for cache failures. Default session signing keys from the application secret in `Auth.AuthConfig` or `AUTH_SECRET`.

  BEHAVIOR CHANGE: Configure the application secret or override `Sessions.SessionSigningKeys` instead of passing constructor keys. `getSession({ fresh: true })` bypasses caching; its HTTP route now uses POST, and its Atom binding is a family (`auth.session` remains the default query). Handle `cache-expiry` invalidation windows and include `session-cache` in custom credential-slot and native-header mappings.

- Updated dependencies []:
  - @yielded/crypto@0.1.0-beta.25
  - @yielded/jose@0.1.0-beta.25
  - @yielded/oauth@0.1.0-beta.25

## 0.1.0-beta.24

### Minor Changes

- [#137](https://github.com/yielded-dev/auth/pull/137) [`ade1bda`](https://github.com/yielded-dev/auth/commit/ade1bdaec762f291aad1fc5aac0e68684a940ddc) Thanks [@danieljvdm](https://github.com/danieljvdm)! - Add a stable OAuth callback proxy for registered local and preview environments, with single-use handoffs and independent local sessions. Provide encrypted proxy storage with direct SQL and Drizzle adapters for SQLite, D1, and PostgreSQL.

- [#140](https://github.com/yielded-dev/auth/pull/140) [`33a3f3d`](https://github.com/yielded-dev/auth/commit/33a3f3d7c0a33c9b55bfc080ea5aad29c2d2f3f0) Thanks [@danieljvdm](https://github.com/danieljvdm)! - Declare provider profile schemas on OAuth strategies to validate and infer `providerData` in session claim resolvers. Narrow mixed-provider profiles using the resolver's `provider` field.

### Patch Changes

- [#142](https://github.com/yielded-dev/auth/pull/142) [`d980ff1`](https://github.com/yielded-dev/auth/commit/d980ff1e5f227fe3668052eb4f9852fd4e80ea73) Thanks [@danieljvdm](https://github.com/danieljvdm)! - Honor shortened OAuth refresh claim deadlines so authorized refreshes complete without leaving grants stuck in progress.

- [#138](https://github.com/yielded-dev/auth/pull/138) [`009ae06`](https://github.com/yielded-dev/auth/commit/009ae060b1c5807e1948bcf399137f3081dd7388) Thanks [@danieljvdm](https://github.com/danieljvdm)! - Remove durable password attempts and fresh password sign-in flow writes while retaining commit-time authority checks. BEHAVIOR CHANGE: replace custom password admission/settlement/cleanup with `findCredential` and `rehashIfCurrent`, remove attempt mappings and `attemptLifetimeMillis`, return `{ revision, requirement }` from `AuthenticationAuthority.capture`, and honor fresh session issuance in custom stores; obsolete password attempt tables can be dropped without resetting credentials or sessions.

- [#140](https://github.com/yielded-dev/auth/pull/140) [`33a3f3d`](https://github.com/yielded-dev/auth/commit/33a3f3d7c0a33c9b55bfc080ea5aad29c2d2f3f0) Thanks [@danieljvdm](https://github.com/danieljvdm)! - Add `Slack.provider` for Sign in with Slack using shared OIDC verification and S256 PKCE. Expose verified Slack workspace and user claims through `SlackUserProfile`.
- Updated dependencies []:
  - @yielded/crypto@0.1.0-beta.24
  - @yielded/jose@0.1.0-beta.24
  - @yielded/oauth@0.1.0-beta.24

## 0.1.0-beta.23

### Patch Changes

- [#133](https://github.com/yielded-dev/auth/pull/133) [`2742351`](https://github.com/yielded-dev/auth/commit/27423515058032699f392712391321406cf2aa0e) Thanks [@danieljvdm](https://github.com/danieljvdm)! - Bound the default proof request limiter to 10,000 network keys per process, evicting the least recently checked key when full instead of retaining every address.

- [#135](https://github.com/yielded-dev/auth/pull/135) [`aa8ba53`](https://github.com/yielded-dev/auth/commit/aa8ba53ff87b9905eb62e2663a4f888bbabfbb56) Thanks [@danieljvdm](https://github.com/danieljvdm)! - Reduce a complete password sign-in to 22 database calls on PostgreSQL and 20 on SQLite by reusing the authority requirement that completion already read, and, without row locks, by reading the attempt and session authority once.

- [#129](https://github.com/yielded-dev/auth/pull/129) [`0fb0a5d`](https://github.com/yielded-dev/auth/commit/0fb0a5da1e395c579ac67d6fc9389dc5267cb0ea) Thanks [@danieljvdm](https://github.com/danieljvdm)! - Share password attempt persistence through native Effect SQL and use bounded process-local password rate limits with replaceable shared storage. BEHAVIOR CHANGE: supply a shared `RateLimiterStore` for multi-instance limits, replace custom `admitAttempt` implementations with `prepareAttempt`, and remove password rate-table mappings and the password `maximumPending` setting.
- Updated dependencies []:
  - @yielded/crypto@0.1.0-beta.23
  - @yielded/jose@0.1.0-beta.23
  - @yielded/oauth@0.1.0-beta.23

## 0.1.0-beta.22

### Patch Changes

- [#130](https://github.com/yielded-dev/auth/pull/130) [`1d4c0db`](https://github.com/yielded-dev/auth/commit/1d4c0db87517455eb1d7eef10e802b61650189dc) Thanks [@danieljvdm](https://github.com/danieljvdm)! - Keep the initial server-rendered session visible while live verification confirms the same account. Continue clearing it on failures and explicit account replacement.
- Updated dependencies []:
  - @yielded/crypto@0.1.0-beta.22
  - @yielded/jose@0.1.0-beta.22
  - @yielded/oauth@0.1.0-beta.22

## 0.1.0-beta.21

### Minor Changes

- [#122](https://github.com/yielded-dev/auth/pull/122) [`412c808`](https://github.com/yielded-dev/auth/commit/412c808796a1a52ee0dd568f9a88433d6a9ef2d4) Thanks [@danieljvdm](https://github.com/danieljvdm)! - Support MCP client metadata discovery, private-key JWT and shared-secret client authentication, and OAuth 2.1 callback handling. BEHAVIOR CHANGE: supply HttpClient and Signature services to OAuthServer Layers, apply OAuthServerPersistence.migrations for grants and assertion receipts, and implement consumeAssertion in custom persistence adapters; configure trusted metadata origins and network egress for remote discovery.

### Patch Changes

- Updated dependencies []:
  - @yielded/crypto@0.1.0-beta.21
  - @yielded/jose@0.1.0-beta.21
  - @yielded/oauth@0.1.0-beta.21

## 0.1.0-beta.20

### Minor Changes

- [#121](https://github.com/yielded-dev/auth/pull/121) [`3d6d331`](https://github.com/yielded-dev/auth/commit/3d6d331856712cbc4804cf0c495f01bb3124b38b) Thanks [@danieljvdm](https://github.com/danieljvdm)! - Share auth cookies across a parent domain and admit additional trusted HTTPS origins. Allow exact absolute OAuth and email return routes on explicitly trusted origins while preserving existing host-only defaults.

### Patch Changes

- Updated dependencies [[`0c61f7a`](https://github.com/yielded-dev/auth/commit/0c61f7a766766929d642cc8e17b6091c89ea62e9)]:
  - @yielded/oauth@0.1.0-beta.20
  - @yielded/crypto@0.1.0-beta.20

## 0.1.0-beta.19

### Minor Changes

- [#107](https://github.com/yielded-dev/auth/pull/107) [`c4752e3`](https://github.com/yielded-dev/auth/commit/c4752e34b3b6f3a4f53270727fbdc3050d65935a) Thanks [@danieljvdm](https://github.com/danieljvdm)! - Add reusable Effect crypto, Schema-typed JOSE, and OAuth/OIDC packages, and adopt them throughout Auth without changing stored credential formats. Remove unnecessary signing-service requirements from GitHub and use scoped HMAC keys for sessions and numeric proofs.

  BEHAVIOR CHANGE: Replace the former crypto/OpenID adapter imports with Auth's direct service Layers and `OpenIdConnect`/`GitHub` modules, supplying crypto and HTTP services explicitly. Implement scoped `Hmac.importKey` in custom backends, replace Auth `SubtleCrypto` overrides with `Hmac` Layers, and keep direct session/numeric-proof crypto constructors in an open Scope. Set managed storage's `prefix`, yield `Adapter.makeStorageMappings(storage)` with Effect Crypto supplied, and wrap application-owned Durable Object Drizzle databases with `SqliteDo.makeDatabase` for asynchronous transactions.

### Patch Changes

- [#107](https://github.com/yielded-dev/auth/pull/107) [`c4752e3`](https://github.com/yielded-dev/auth/commit/c4752e34b3b6f3a4f53270727fbdc3050d65935a) Thanks [@danieljvdm](https://github.com/danieljvdm)! - Require application-supplied crypto Layers throughout Auth and acquire storage-mapping dependencies through Effect requirements. Remove the unused Hmac requirement from JWKS and OIDC verification.

  BEHAVIOR CHANGE: Replace `Persistence.cryptoLayer` with your selected backend and provide it to the Auth Layer. Yield `Adapter.makeStorageMappings(storage)` inside an Effect with `Crypto` supplied.

- [#107](https://github.com/yielded-dev/auth/pull/107) [`c4752e3`](https://github.com/yielded-dev/auth/commit/c4752e34b3b6f3a4f53270727fbdc3050d65935a) Thanks [@danieljvdm](https://github.com/danieljvdm)! - Cancel and join OAuth identity decoding when its provider scope closes. Preserve same-fiber KDF admission through scoped cleanup.

- Updated dependencies [[`c4752e3`](https://github.com/yielded-dev/auth/commit/c4752e34b3b6f3a4f53270727fbdc3050d65935a), [`c4752e3`](https://github.com/yielded-dev/auth/commit/c4752e34b3b6f3a4f53270727fbdc3050d65935a), [`c4752e3`](https://github.com/yielded-dev/auth/commit/c4752e34b3b6f3a4f53270727fbdc3050d65935a)]:
  - @yielded/oauth@0.1.0-beta.19
  - @yielded/crypto@0.1.0-beta.19

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
