# @yielded/jose

## 0.1.0-beta.42

### Patch Changes

- [#243](https://github.com/yielded-dev/auth/pull/243) [`0a0ff7d`](https://github.com/yielded-dev/auth/commit/0a0ff7d6d81d8b9e0aacd39ec81991b1f259e956) Thanks [@danieljvdm](https://github.com/danieljvdm)! - Preserve complete failure causes across authentication, persistence, provider, and native client boundaries, and report unexpected background and cleanup failures without exposing private data.
- Updated dependencies [[`0a0ff7d`](https://github.com/yielded-dev/auth/commit/0a0ff7d6d81d8b9e0aacd39ec81991b1f259e956)]:
  - @yielded/crypto@0.1.0-beta.42

## 0.1.0-beta.41

### Patch Changes

- Updated dependencies []:
  - @yielded/crypto@0.1.0-beta.41

## 0.1.0-beta.40

### Patch Changes

- Updated dependencies []:
  - @yielded/crypto@0.1.0-beta.40

## 0.1.0-beta.39

### Patch Changes

- Updated dependencies []:
  - @yielded/crypto@0.1.0-beta.39

## 0.1.0-beta.38

### Patch Changes

- Updated dependencies [[`2186f4f`](https://github.com/yielded-dev/auth/commit/2186f4f649c72d3d37be7fcf25e10f097a4fcb04)]:
  - @yielded/crypto@0.1.0-beta.38

## 0.1.0-beta.37

### Patch Changes

- Updated dependencies []:
  - @yielded/crypto@0.1.0-beta.37

## 0.1.0-beta.36

### Patch Changes

- Updated dependencies []:
  - @yielded/crypto@0.1.0-beta.36

## 0.1.0-beta.35

### Patch Changes

- [#218](https://github.com/yielded-dev/auth/pull/218) [`0a3254c`](https://github.com/yielded-dev/auth/commit/0a3254cfb5c4633d88a81aadb263a0efed7b3d85) Thanks [@danieljvdm](https://github.com/danieljvdm)! - Validate canonical base64url length and unused tail bits before decoding without re-encoding every decoded segment.

- [#228](https://github.com/yielded-dev/auth/pull/228) [`b7f695b`](https://github.com/yielded-dev/auth/commit/b7f695bc71991164f0935ed7781a1898d9905aaf) Thanks [@danieljvdm](https://github.com/danieljvdm)! - Support remote signing-key retrieval on Cloudflare Workers while continuing to reject redirects.

- [#209](https://github.com/yielded-dev/auth/pull/209) [`948a3f1`](https://github.com/yielded-dev/auth/commit/948a3f12295b59c0bc560941edbbef59cc0b77b9) Thanks [@danieljvdm](https://github.com/danieljvdm)! - Reuse validated public-key imports within each JWKS layer while preserving crypto service overrides and independent returned key bytes.

- [#209](https://github.com/yielded-dev/auth/pull/209) [`948a3f1`](https://github.com/yielded-dev/auth/commit/948a3f12295b59c0bc560941edbbef59cc0b77b9) Thanks [@danieljvdm](https://github.com/danieljvdm)! - Reuse local public-key resolvers for OAuth client assertions within each configured key generation. Expose `Jwks.makeLocal` to retain a validated local resolver without building a Layer.
- Updated dependencies [[`bdc849c`](https://github.com/yielded-dev/auth/commit/bdc849cde2c652d27f59d60f2a120c9873ce62c0)]:
  - @yielded/crypto@0.1.0-beta.35

## 0.1.0-beta.34

### Patch Changes

- [#203](https://github.com/yielded-dev/auth/pull/203) [`5264de7`](https://github.com/yielded-dev/auth/commit/5264de78aee570c82718b2841ec38ea17544fa3e) Thanks [@danieljvdm](https://github.com/danieljvdm)! - Support Effect 4.0.3 across authentication workflows and companion packages. Require Effect 4.0.3 or later.
- Updated dependencies [[`5264de7`](https://github.com/yielded-dev/auth/commit/5264de78aee570c82718b2841ec38ea17544fa3e)]:
  - @yielded/crypto@0.1.0-beta.34

## 0.1.0-beta.33

### Patch Changes

- [#181](https://github.com/yielded-dev/auth/pull/181) [`b9b43e2`](https://github.com/yielded-dev/auth/commit/b9b43e24f6fedda4168cfb65b081c296ffd9233f) Thanks [@danieljvdm](https://github.com/danieljvdm)! - Add `Apple.provider` for Sign in with Apple, with ES256 client-secret JWTs from a `.p8` key. Accept form_post callbacks and first-consent names through direct routes with a `SameSite=None; Secure` request-binding cookie and through the callback proxy.

  BEHAVIOR CHANGE: Custom `Signature` services must implement `decodePrivateKey`.

- [#178](https://github.com/yielded-dev/auth/pull/178) [`881f94d`](https://github.com/yielded-dev/auth/commit/881f94d31c9dfd3119bb2544925f9ee1d8b78368) Thanks [@danieljvdm](https://github.com/danieljvdm)! - Add `Microsoft.provider` for Entra ID sign-in, with `oid:tid` subjects and a PKCE supplement for the v2.0 endpoints. Accept `{tenantid}` discovery issuers by substituting the verified `tid` and checking the selected signing key's issuer, including after a concrete tenant is pinned. Commercial `consumers` keeps the personal-account issuer, and a tenant domain is not accepted from that template. Refresh against the template requires the original `iss`.
- Updated dependencies [[`b9b43e2`](https://github.com/yielded-dev/auth/commit/b9b43e24f6fedda4168cfb65b081c296ffd9233f)]:
  - @yielded/crypto@0.1.0-beta.33

## 0.1.0-beta.32

### Patch Changes

- Updated dependencies []:
  - @yielded/crypto@0.1.0-beta.32

## 0.1.0-beta.31

### Patch Changes

- Updated dependencies [[`b5388b6`](https://github.com/yielded-dev/auth/commit/b5388b6e4bc0ebadf10e97367c09638ba17724e0)]:
  - @yielded/crypto@0.1.0-beta.31

## 0.1.0-beta.30

### Minor Changes

- [#170](https://github.com/yielded-dev/auth/pull/170) [`dd0a495`](https://github.com/yielded-dev/auth/commit/dd0a4951597c230e6e7ef11725c626ce8b80318b) Thanks [@danieljvdm](https://github.com/danieljvdm)! - Add Effect-native signing key generation with typed components and redacted private JWKs.

  BEHAVIOR CHANGE: custom `Signature` services must implement `generateKeyPair`.

### Patch Changes

- Updated dependencies [[`dd0a495`](https://github.com/yielded-dev/auth/commit/dd0a4951597c230e6e7ef11725c626ce8b80318b)]:
  - @yielded/crypto@0.1.0-beta.30

## 0.1.0-beta.29

### Patch Changes

- Updated dependencies [[`536a76b`](https://github.com/yielded-dev/auth/commit/536a76b6cd7d653b456adfcf0f81d275cda77660)]:
  - @yielded/crypto@0.1.0-beta.29

## 0.1.0-beta.28

### Patch Changes

- Updated dependencies []:
  - @yielded/crypto@0.1.0-beta.28

## 0.1.0-beta.27

### Patch Changes

- Updated dependencies []:
  - @yielded/crypto@0.1.0-beta.27

## 0.1.0-beta.26

### Patch Changes

- Updated dependencies []:
  - @yielded/crypto@0.1.0-beta.26

## 0.1.0-beta.25

### Patch Changes

- Updated dependencies []:
  - @yielded/crypto@0.1.0-beta.25

## 0.1.0-beta.24

### Patch Changes

- Updated dependencies []:
  - @yielded/crypto@0.1.0-beta.24

## 0.1.0-beta.23

### Patch Changes

- Updated dependencies []:
  - @yielded/crypto@0.1.0-beta.23

## 0.1.0-beta.22

### Patch Changes

- Updated dependencies []:
  - @yielded/crypto@0.1.0-beta.22

## 0.1.0-beta.21

### Patch Changes

- Updated dependencies []:
  - @yielded/crypto@0.1.0-beta.21

## 0.1.0-beta.20

### Patch Changes

- Updated dependencies []:
  - @yielded/crypto@0.1.0-beta.20

## 0.1.0-beta.19

### Minor Changes

- [#107](https://github.com/yielded-dev/auth/pull/107) [`c4752e3`](https://github.com/yielded-dev/auth/commit/c4752e34b3b6f3a4f53270727fbdc3050d65935a) Thanks [@danieljvdm](https://github.com/danieljvdm)! - Add reusable Effect crypto, Schema-typed JOSE, and OAuth/OIDC packages, and adopt them throughout Auth without changing stored credential formats. Remove unnecessary signing-service requirements from GitHub and use scoped HMAC keys for sessions and numeric proofs.

  BEHAVIOR CHANGE: Replace the former crypto/OpenID adapter imports with Auth's direct service Layers and `OpenIdConnect`/`GitHub` modules, supplying crypto and HTTP services explicitly. Implement scoped `Hmac.importKey` in custom backends, replace Auth `SubtleCrypto` overrides with `Hmac` Layers, and keep direct session/numeric-proof crypto constructors in an open Scope. Set managed storage's `prefix`, yield `Adapter.makeStorageMappings(storage)` with Effect Crypto supplied, and wrap application-owned Durable Object Drizzle databases with `SqliteDo.makeDatabase` for asynchronous transactions.

### Patch Changes

- [#107](https://github.com/yielded-dev/auth/pull/107) [`c4752e3`](https://github.com/yielded-dev/auth/commit/c4752e34b3b6f3a4f53270727fbdc3050d65935a) Thanks [@danieljvdm](https://github.com/danieljvdm)! - Require application-supplied crypto Layers throughout Auth and acquire storage-mapping dependencies through Effect requirements. Remove the unused Hmac requirement from JWKS and OIDC verification.

  BEHAVIOR CHANGE: Replace `Persistence.cryptoLayer` with your selected backend and provide it to the Auth Layer. Yield `Adapter.makeStorageMappings(storage)` inside an Effect with `Crypto` supplied.

- Updated dependencies [[`c4752e3`](https://github.com/yielded-dev/auth/commit/c4752e34b3b6f3a4f53270727fbdc3050d65935a), [`c4752e3`](https://github.com/yielded-dev/auth/commit/c4752e34b3b6f3a4f53270727fbdc3050d65935a)]:
  - @yielded/crypto@0.1.0-beta.19
