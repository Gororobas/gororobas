# @yielded/crypto

## 0.1.0-beta.39

No changes in this release.

## 0.1.0-beta.38

### Patch Changes

- [#234](https://github.com/yielded-dev/auth/pull/234) [`2186f4f`](https://github.com/yielded-dev/auth/commit/2186f4f649c72d3d37be7fcf25e10f097a4fcb04) Thanks [@danieljvdm](https://github.com/danieljvdm)! - Provide `WorkerdPasswordlessServices.layer` for Workers authentication without Argon2 Wasm or Node.js compatibility. Reject OAuth protector construction when the supplied AEAD service lacks XChaCha20-Poly1305 support.

  BEHAVIOR CHANGE: Implement `supports(algorithm)` on custom `Aead` services.

## 0.1.0-beta.37

No changes in this release.

## 0.1.0-beta.36

No changes in this release.

## 0.1.0-beta.35

### Patch Changes

- [#211](https://github.com/yielded-dev/auth/pull/211) [`bdc849c`](https://github.com/yielded-dev/auth/commit/bdc849cde2c652d27f59d60f2a120c9873ce62c0) Thanks [@danieljvdm](https://github.com/danieljvdm)! - Reduce CPU overhead for Argon2id derivations while preserving KDF parameters and cancellation boundaries.

## 0.1.0-beta.34

### Patch Changes

- [#203](https://github.com/yielded-dev/auth/pull/203) [`5264de7`](https://github.com/yielded-dev/auth/commit/5264de78aee570c82718b2841ec38ea17544fa3e) Thanks [@danieljvdm](https://github.com/danieljvdm)! - Support Effect 4.0.3 across authentication workflows and companion packages. Require Effect 4.0.3 or later.

## 0.1.0-beta.33

### Patch Changes

- [#181](https://github.com/yielded-dev/auth/pull/181) [`b9b43e2`](https://github.com/yielded-dev/auth/commit/b9b43e24f6fedda4168cfb65b081c296ffd9233f) Thanks [@danieljvdm](https://github.com/danieljvdm)! - Add `Apple.provider` for Sign in with Apple, with ES256 client-secret JWTs from a `.p8` key. Accept form_post callbacks and first-consent names through direct routes with a `SameSite=None; Secure` request-binding cookie and through the callback proxy.

  BEHAVIOR CHANGE: Custom `Signature` services must implement `decodePrivateKey`.

## 0.1.0-beta.32

No changes in this release.

## 0.1.0-beta.31

### Minor Changes

- [#187](https://github.com/yielded-dev/auth/pull/187) [`b5388b6`](https://github.com/yielded-dev/auth/commit/b5388b6e4bc0ebadf10e97367c09638ba17724e0) Thanks [@danieljvdm](https://github.com/danieljvdm)! - Accelerate Argon2id on Workers with bundled Wasm and add native scrypt on Node, Bun, and Workers. Select `defaultScryptPasswordHashingConfig` to migrate passwords to scrypt on successful sign-in; **BEHAVIOR CHANGE:** custom `Kdf` services must provide `scrypt`.

## 0.1.0-beta.30

### Minor Changes

- [#170](https://github.com/yielded-dev/auth/pull/170) [`dd0a495`](https://github.com/yielded-dev/auth/commit/dd0a4951597c230e6e7ef11725c626ce8b80318b) Thanks [@danieljvdm](https://github.com/danieljvdm)! - Add Effect-native signing key generation with typed components and redacted private JWKs.

  BEHAVIOR CHANGE: custom `Signature` services must implement `generateKeyPair`.

## 0.1.0-beta.29

### Minor Changes

- [#160](https://github.com/yielded-dev/auth/pull/160) [`536a76b`](https://github.com/yielded-dev/auth/commit/536a76b6cd7d653b456adfcf0f81d275cda77660) Thanks [@danieljvdm](https://github.com/danieljvdm)! - Reduce portable Argon2id and HMAC scheduling overhead and XChaCha buffer allocation. Reuse AES-GCM and signature keys through scoped imports.

  BEHAVIOR CHANGE: Custom `Aead` services must implement `importKey`; custom `Signature` services must implement `importPrivateKey` and `importPublicKey` with scoped key ownership.

## 0.1.0-beta.28

No changes in this release.

## 0.1.0-beta.27

No changes in this release.

## 0.1.0-beta.26

No changes in this release.

## 0.1.0-beta.25

No changes in this release.

## 0.1.0-beta.24

No changes in this release.

## 0.1.0-beta.23

No changes in this release.

## 0.1.0-beta.22

No changes in this release.

## 0.1.0-beta.21

No changes in this release.

## 0.1.0-beta.20

## 0.1.0-beta.19

### Minor Changes

- [#107](https://github.com/yielded-dev/auth/pull/107) [`c4752e3`](https://github.com/yielded-dev/auth/commit/c4752e34b3b6f3a4f53270727fbdc3050d65935a) Thanks [@danieljvdm](https://github.com/danieljvdm)! - Add reusable Effect crypto, Schema-typed JOSE, and OAuth/OIDC packages, and adopt them throughout Auth without changing stored credential formats. Remove unnecessary signing-service requirements from GitHub and use scoped HMAC keys for sessions and numeric proofs.

  BEHAVIOR CHANGE: Replace the former crypto/OpenID adapter imports with Auth's direct service Layers and `OpenIdConnect`/`GitHub` modules, supplying crypto and HTTP services explicitly. Implement scoped `Hmac.importKey` in custom backends, replace Auth `SubtleCrypto` overrides with `Hmac` Layers, and keep direct session/numeric-proof crypto constructors in an open Scope. Set managed storage's `prefix`, yield `Adapter.makeStorageMappings(storage)` with Effect Crypto supplied, and wrap application-owned Durable Object Drizzle databases with `SqliteDo.makeDatabase` for asynchronous transactions.

### Patch Changes

- [#107](https://github.com/yielded-dev/auth/pull/107) [`c4752e3`](https://github.com/yielded-dev/auth/commit/c4752e34b3b6f3a4f53270727fbdc3050d65935a) Thanks [@danieljvdm](https://github.com/danieljvdm)! - Cancel and join OAuth identity decoding when its provider scope closes. Preserve same-fiber KDF admission through scoped cleanup.
