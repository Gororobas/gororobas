# @yielded/oauth

## 0.1.0-beta.42

### Patch Changes

- [#243](https://github.com/yielded-dev/auth/pull/243) [`0a0ff7d`](https://github.com/yielded-dev/auth/commit/0a0ff7d6d81d8b9e0aacd39ec81991b1f259e956) Thanks [@danieljvdm](https://github.com/danieljvdm)! - Preserve complete failure causes across authentication, persistence, provider, and native client boundaries, and report unexpected background and cleanup failures without exposing private data.
- Updated dependencies [[`0a0ff7d`](https://github.com/yielded-dev/auth/commit/0a0ff7d6d81d8b9e0aacd39ec81991b1f259e956)]:
  - @yielded/jose@0.1.0-beta.42

## 0.1.0-beta.41

### Patch Changes

- Updated dependencies []:
  - @yielded/jose@0.1.0-beta.41

## 0.1.0-beta.40

### Patch Changes

- Updated dependencies []:
  - @yielded/jose@0.1.0-beta.40

## 0.1.0-beta.39

### Patch Changes

- Updated dependencies []:
  - @yielded/jose@0.1.0-beta.39

## 0.1.0-beta.38

### Patch Changes

- Updated dependencies []:
  - @yielded/jose@0.1.0-beta.38

## 0.1.0-beta.37

### Patch Changes

- Updated dependencies []:
  - @yielded/jose@0.1.0-beta.37

## 0.1.0-beta.36

### Patch Changes

- Updated dependencies []:
  - @yielded/jose@0.1.0-beta.36

## 0.1.0-beta.35

### Patch Changes

- Updated dependencies [[`0a3254c`](https://github.com/yielded-dev/auth/commit/0a3254cfb5c4633d88a81aadb263a0efed7b3d85), [`b7f695b`](https://github.com/yielded-dev/auth/commit/b7f695bc71991164f0935ed7781a1898d9905aaf), [`948a3f1`](https://github.com/yielded-dev/auth/commit/948a3f12295b59c0bc560941edbbef59cc0b77b9), [`948a3f1`](https://github.com/yielded-dev/auth/commit/948a3f12295b59c0bc560941edbbef59cc0b77b9)]:
  - @yielded/jose@0.1.0-beta.35

## 0.1.0-beta.34

### Patch Changes

- [#203](https://github.com/yielded-dev/auth/pull/203) [`5264de7`](https://github.com/yielded-dev/auth/commit/5264de78aee570c82718b2841ec38ea17544fa3e) Thanks [@danieljvdm](https://github.com/danieljvdm)! - Support Effect 4.0.3 across authentication workflows and companion packages. Require Effect 4.0.3 or later.
- Updated dependencies [[`5264de7`](https://github.com/yielded-dev/auth/commit/5264de78aee570c82718b2841ec38ea17544fa3e)]:
  - @yielded/jose@0.1.0-beta.34

## 0.1.0-beta.33

### Patch Changes

- [#181](https://github.com/yielded-dev/auth/pull/181) [`b9b43e2`](https://github.com/yielded-dev/auth/commit/b9b43e24f6fedda4168cfb65b081c296ffd9233f) Thanks [@danieljvdm](https://github.com/danieljvdm)! - Add `Apple.provider` for Sign in with Apple, with ES256 client-secret JWTs from a `.p8` key. Accept form_post callbacks and first-consent names through direct routes with a `SameSite=None; Secure` request-binding cookie and through the callback proxy.

  BEHAVIOR CHANGE: Custom `Signature` services must implement `decodePrivateKey`.

- [#180](https://github.com/yielded-dev/auth/pull/180) [`0ad3e4c`](https://github.com/yielded-dev/auth/commit/0ad3e4cc67a954e3a2f20aae9491e1608fd5ccea) Thanks [@danieljvdm](https://github.com/danieljvdm)! - Add Linear, Dropbox, and Notion sign-in. Plain OAuth identity can come from a GET, a POST, or the token response, and JSON token requests reject repeated parameter names.

- [#175](https://github.com/yielded-dev/auth/pull/175) [`2326161`](https://github.com/yielded-dev/auth/commit/232616128ad88418c375de9256614d37053c76e2) Thanks [@danieljvdm](https://github.com/danieljvdm)! - Add LINE, Roblox, and Railway OpenID sign-in. LINE verifies web-login HS256 ID tokens with the channel secret, Roblox keeps its trailing-slash issuer, and Railway merges UserInfo from its published `/oauth` discovery document.

- [#178](https://github.com/yielded-dev/auth/pull/178) [`881f94d`](https://github.com/yielded-dev/auth/commit/881f94d31c9dfd3119bb2544925f9ee1d8b78368) Thanks [@danieljvdm](https://github.com/danieljvdm)! - Add `Microsoft.provider` for Entra ID sign-in, with `oid:tid` subjects and a PKCE supplement for the v2.0 endpoints. Accept `{tenantid}` discovery issuers by substituting the verified `tid` and checking the selected signing key's issuer, including after a concrete tenant is pinned. Commercial `consumers` keeps the personal-account issuer, and a tenant domain is not accepted from that template. Refresh against the template requires the original `iss`.
- Updated dependencies [[`b9b43e2`](https://github.com/yielded-dev/auth/commit/b9b43e24f6fedda4168cfb65b081c296ffd9233f), [`881f94d`](https://github.com/yielded-dev/auth/commit/881f94d31c9dfd3119bb2544925f9ee1d8b78368)]:
  - @yielded/jose@0.1.0-beta.33

## 0.1.0-beta.32

### Patch Changes

- Updated dependencies []:
  - @yielded/jose@0.1.0-beta.32

## 0.1.0-beta.31

### Patch Changes

- [#171](https://github.com/yielded-dev/auth/pull/171) [`a1c5555`](https://github.com/yielded-dev/auth/commit/a1c555586cdf5415530ea71e08b25da3063772a3) Thanks [@danieljvdm](https://github.com/danieljvdm)! - Let OAuth and OpenID presets carry their own profile schema, accept advertised ES256, PS256 and EdDSA ID tokens, and opt out of PKCE. Sign-in begin accepts prompt and loginHint, and OIDC can merge UserInfo into ID-token claims. EdDSA hash claims use SHA-512. Connected refresh keeps the stored identity and does not re-decode UserInfo-only profile fields.
- Updated dependencies []:
  - @yielded/jose@0.1.0-beta.31

## 0.1.0-beta.30

### Patch Changes

- Updated dependencies [[`dd0a495`](https://github.com/yielded-dev/auth/commit/dd0a4951597c230e6e7ef11725c626ce8b80318b)]:
  - @yielded/jose@0.1.0-beta.30

## 0.1.0-beta.29

### Patch Changes

- Updated dependencies []:
  - @yielded/jose@0.1.0-beta.29

## 0.1.0-beta.28

### Patch Changes

- Updated dependencies []:
  - @yielded/jose@0.1.0-beta.28

## 0.1.0-beta.27

### Patch Changes

- Updated dependencies []:
  - @yielded/jose@0.1.0-beta.27

## 0.1.0-beta.26

### Patch Changes

- Updated dependencies []:
  - @yielded/jose@0.1.0-beta.26

## 0.1.0-beta.25

### Patch Changes

- Updated dependencies []:
  - @yielded/jose@0.1.0-beta.25

## 0.1.0-beta.24

### Patch Changes

- Updated dependencies []:
  - @yielded/jose@0.1.0-beta.24

## 0.1.0-beta.23

### Patch Changes

- Updated dependencies []:
  - @yielded/jose@0.1.0-beta.23

## 0.1.0-beta.22

### Patch Changes

- Updated dependencies []:
  - @yielded/jose@0.1.0-beta.22

## 0.1.0-beta.21

### Patch Changes

- Updated dependencies []:
  - @yielded/jose@0.1.0-beta.21

## 0.1.0-beta.20

### Patch Changes

- [#123](https://github.com/yielded-dev/auth/pull/123) [`0c61f7a`](https://github.com/yielded-dev/auth/commit/0c61f7a766766929d642cc8e17b6091c89ea62e9) Thanks [@danieljvdm](https://github.com/danieljvdm)! - Support OAuth requests on Cloudflare Workers while continuing to reject provider redirects.

- Updated dependencies []:
  - @yielded/jose@0.1.0-beta.20

## 0.1.0-beta.19

### Minor Changes

- [#107](https://github.com/yielded-dev/auth/pull/107) [`c4752e3`](https://github.com/yielded-dev/auth/commit/c4752e34b3b6f3a4f53270727fbdc3050d65935a) Thanks [@danieljvdm](https://github.com/danieljvdm)! - Add reusable Effect crypto, Schema-typed JOSE, and OAuth/OIDC packages, and adopt them throughout Auth without changing stored credential formats. Remove unnecessary signing-service requirements from GitHub and use scoped HMAC keys for sessions and numeric proofs.

  BEHAVIOR CHANGE: Replace the former crypto/OpenID adapter imports with Auth's direct service Layers and `OpenIdConnect`/`GitHub` modules, supplying crypto and HTTP services explicitly. Implement scoped `Hmac.importKey` in custom backends, replace Auth `SubtleCrypto` overrides with `Hmac` Layers, and keep direct session/numeric-proof crypto constructors in an open Scope. Set managed storage's `prefix`, yield `Adapter.makeStorageMappings(storage)` with Effect Crypto supplied, and wrap application-owned Durable Object Drizzle databases with `SqliteDo.makeDatabase` for asynchronous transactions.

### Patch Changes

- [#107](https://github.com/yielded-dev/auth/pull/107) [`c4752e3`](https://github.com/yielded-dev/auth/commit/c4752e34b3b6f3a4f53270727fbdc3050d65935a) Thanks [@danieljvdm](https://github.com/danieljvdm)! - Require application-supplied crypto Layers throughout Auth and acquire storage-mapping dependencies through Effect requirements. Remove the unused Hmac requirement from JWKS and OIDC verification.

  BEHAVIOR CHANGE: Replace `Persistence.cryptoLayer` with your selected backend and provide it to the Auth Layer. Yield `Adapter.makeStorageMappings(storage)` inside an Effect with `Crypto` supplied.

- Updated dependencies [[`c4752e3`](https://github.com/yielded-dev/auth/commit/c4752e34b3b6f3a4f53270727fbdc3050d65935a), [`c4752e3`](https://github.com/yielded-dev/auth/commit/c4752e34b3b6f3a4f53270727fbdc3050d65935a)]:
  - @yielded/jose@0.1.0-beta.19
