# @yielded/auth-persistence

## 0.1.0-beta.18

### Patch Changes

- [#110](https://github.com/yielded-dev/auth/pull/110) [`b904442`](https://github.com/yielded-dev/auth/commit/b904442510ec0b5412e4be81933a4e1523e16260) Thanks [@goknsh](https://github.com/goknsh)! - Support TypeScript consumers with `exactOptionalPropertyTypes` enabled, including the default session lifecycle actions.

- Updated dependencies [[`9aaaa55`](https://github.com/yielded-dev/auth/commit/9aaaa55fff9e7bf7236036ba3fe8b84337eb3eae), [`b904442`](https://github.com/yielded-dev/auth/commit/b904442510ec0b5412e4be81933a4e1523e16260), [`a9009bf`](https://github.com/yielded-dev/auth/commit/a9009bf44c935946f7e8acde1a0073ef0239542a)]:
  - @yielded/auth@0.1.0-beta.18
  - @yielded/auth-crypto@0.1.0-beta.18

## 0.1.0-beta.17

### Patch Changes

- Updated dependencies [[`2d6f361`](https://github.com/yielded-dev/auth/commit/2d6f361813bfa8523451120eddabcd801b83ab6d)]:
  - @yielded/auth@0.1.0-beta.17
  - @yielded/auth-crypto@0.1.0-beta.17

## 0.1.0-beta.16

### Patch Changes

- Updated dependencies [[`a070c44`](https://github.com/yielded-dev/auth/commit/a070c44a4c86f79e2782119e74d7eae3ae064542)]:
  - @yielded/auth@0.1.0-beta.16
  - @yielded/auth-crypto@0.1.0-beta.16

## 0.1.0-beta.15

### Minor Changes

- [#71](https://github.com/yielded-dev/auth/pull/71) [`ac61865`](https://github.com/yielded-dev/auth/commit/ac61865b374c03e2046cbfb3e8fb6a824893fb4e) Thanks [@danieljvdm](https://github.com/danieljvdm)! - Add system-browser sign-in for Electron and iOS apps with separate native sessions and configurable browser-session reuse. Keep Apple association setup optional and application-owned.

### Patch Changes

- [#97](https://github.com/yielded-dev/auth/pull/97) [`2400d10`](https://github.com/yielded-dev/auth/commit/2400d10c2bcdf14d76b9b5c2e02a6f39e67911e9) Thanks [@danieljvdm](https://github.com/danieljvdm)! - Validate explicit Drizzle mappings against the captured database's physical unique keys before acquiring services or transaction coordinators.

  BEHAVIOR CHANGE: Apply application migrations before building adapter Layers and permit database catalog reads; declared constraints alone no longer satisfy acquisition.

- [#84](https://github.com/yielded-dev/auth/pull/84) [`841d4c8`](https://github.com/yielded-dev/auth/commit/841d4c809e282ad10214a6abac570b1b45a263b1) Thanks [@danieljvdm](https://github.com/danieljvdm)! - Protect active codes and reset links from other request attempts, charge only issued proofs, provide configurable request rate limiting by default, and expose `Adapter.makeStorageMappings` for adapter composition. BEHAVIOR CHANGE: supply `Proofs.ProofRequestContext` for non-HTTP calls and provide raw HTTP operation handlers, codecs, and callback services at `server.handle` invocation; standard Auth HTTP routes supply the caller automatically.

- Updated dependencies [[`27126ab`](https://github.com/yielded-dev/auth/commit/27126ab493f71260416c623380ab3fcbe0ed8596), [`1650b34`](https://github.com/yielded-dev/auth/commit/1650b34275537a11fe629bc0fd7d749c023a05f0), [`d5e1f04`](https://github.com/yielded-dev/auth/commit/d5e1f0491732f30f10eea308667942be6aa51286), [`877f025`](https://github.com/yielded-dev/auth/commit/877f0256f2f3760b6f909f41f0985ac311149000), [`ac61865`](https://github.com/yielded-dev/auth/commit/ac61865b374c03e2046cbfb3e8fb6a824893fb4e), [`328b136`](https://github.com/yielded-dev/auth/commit/328b136ef2be59cc4763d861a26ae8af4e96b3cd), [`b5c46a1`](https://github.com/yielded-dev/auth/commit/b5c46a1e30a6f80c65a4a15f14354fc6c78e29eb), [`841d4c8`](https://github.com/yielded-dev/auth/commit/841d4c809e282ad10214a6abac570b1b45a263b1), [`e4c0408`](https://github.com/yielded-dev/auth/commit/e4c04089921f2363ae325c7dd8c0f50e0685c860), [`0140ee4`](https://github.com/yielded-dev/auth/commit/0140ee42ba96e49f7753bd8a9de3f8739576dd42), [`b2d82cb`](https://github.com/yielded-dev/auth/commit/b2d82cb59b2d19c2dad2dbc773ced8e6494955e4), [`5aa13b0`](https://github.com/yielded-dev/auth/commit/5aa13b0153d0be0613c3c51d7c442c719b1fe9bd), [`ddeeb6d`](https://github.com/yielded-dev/auth/commit/ddeeb6d47d12b029afa33742cf93aab6e1fe9dcf)]:
  - @yielded/auth@0.1.0-beta.15
  - @yielded/auth-crypto@0.1.0-beta.15

## 0.1.0-beta.14

### Patch Changes

- Updated dependencies [[`b0ef3d8`](https://github.com/yielded-dev/auth/commit/b0ef3d8ffcb1cebca66db115a2f6fd5f3cc4d5ab)]:
  - @yielded/auth@0.1.0-beta.14
  - @yielded/auth-crypto@0.1.0-beta.14

## 0.1.0-beta.13

### Patch Changes

- [#59](https://github.com/yielded-dev/auth/pull/59) [`1c4df1c`](https://github.com/yielded-dev/auth/commit/1c4df1c52668d64b5e3d909cd03a025e88966e6a) Thanks [@danieljvdm](https://github.com/danieljvdm)! - Release password admission after attempt retention, page phone admission cleanup, and resolve an OAuth reservation when the provider issues no token.

  Keep request resources and post-commit hooks on the caller, report password outages as unavailable, and reuse each issuer's JWKS cache.

  BEHAVIOR CHANGE: Clear unresolved reservations left by earlier definite provider rejections if a cohort stays blocked. Password attempts need no reset.

- Updated dependencies [[`1c4df1c`](https://github.com/yielded-dev/auth/commit/1c4df1c52668d64b5e3d909cd03a025e88966e6a), [`1081d5b`](https://github.com/yielded-dev/auth/commit/1081d5b4003e9819e412c753273344ad00d47fc2)]:
  - @yielded/auth@0.1.0-beta.13
  - @yielded/auth-crypto@0.1.0-beta.13

## 0.1.0-beta.12

### Minor Changes

- [#56](https://github.com/yielded-dev/auth/pull/56) [`67c8eff`](https://github.com/yielded-dev/auth/commit/67c8effd7b61ffb677e2a151d320ac308649fd12) Thanks [@danieljvdm](https://github.com/danieljvdm)! - Acquire database, transport, credential-store, and private-output dependencies through Effect services. BEHAVIOR CHANGE: provide each Drizzle driver's `Database` through `databaseLayer` and call its factories with mappings only; provide `Current*Sql` or `NativeDatabase` when acquiring shared Adapter services; select client stores by service key, provide `OperationHttpClient.Client` to `AuthAtom.makeLifetime(options)`, and supply OpenID fetch overrides through `FetchHttpClient.Fetch`.

### Patch Changes

- Align all public packages on a single beta version and release them together.

- Updated dependencies [[`67c8eff`](https://github.com/yielded-dev/auth/commit/67c8effd7b61ffb677e2a151d320ac308649fd12)]:
  - @yielded/auth@0.1.0-beta.12
  - @yielded/auth-crypto@0.1.0-beta.12

## 0.1.0-beta.11

### Minor Changes

- [#45](https://github.com/yielded-dev/auth/pull/45) [`156f0b3`](https://github.com/yielded-dev/auth/commit/156f0b3b01a60bb21f9984d6d464d05f73b79283) Thanks [@danieljvdm](https://github.com/danieljvdm)! - Retain provider access through `OAuth.make({ access: profile })` with shared Auth sessions, grant storage, refresh, and disconnect; remove OAuthApp and its separate persistence adapter.

  BEHAVIOR CHANGE: Reset development OAuthApp cookies/flows/grants and older connected token envelopes, then configure the shared sign-in and connected services; preserve account identities and outstanding reconciliation receipts.

### Patch Changes

- [#52](https://github.com/yielded-dev/auth/pull/52) [`4dbe837`](https://github.com/yielded-dev/auth/commit/4dbe837e23399e1e659c3b6eb7d2a041b5653de0) Thanks [@danieljvdm](https://github.com/danieljvdm)! - Require stable Effect and matching SQL drivers, and update Cloudflare integration to effect-cf 0.53. Support Drizzle RC4 with the temporary Drizzle patch CLI when adding Drizzle to an existing Bun app.

- Updated dependencies [[`b9967b8`](https://github.com/yielded-dev/auth/commit/b9967b8326404a72fc5378c268ae019c4999ef0f), [`75cd72c`](https://github.com/yielded-dev/auth/commit/75cd72c41a3fecdd5c8e84cc76f2dd534b7f2e78), [`9392e50`](https://github.com/yielded-dev/auth/commit/9392e50f2b5ae7b275390fbbbd7a3100855441e4), [`bc112cc`](https://github.com/yielded-dev/auth/commit/bc112ccb9f063e374c40dc12d634efaba6812502), [`4973533`](https://github.com/yielded-dev/auth/commit/49735334149d3d29a34542047a27ff6fffac9f7e), [`4973533`](https://github.com/yielded-dev/auth/commit/49735334149d3d29a34542047a27ff6fffac9f7e), [`4dbe837`](https://github.com/yielded-dev/auth/commit/4dbe837e23399e1e659c3b6eb7d2a041b5653de0), [`156f0b3`](https://github.com/yielded-dev/auth/commit/156f0b3b01a60bb21f9984d6d464d05f73b79283)]:
  - @yielded/auth@0.1.0-beta.11
  - @yielded/auth-crypto@0.1.0-beta.1

## 0.1.0-beta.10

### Minor Changes

- [#38](https://github.com/yielded-dev/auth/pull/38) [`a0e201b`](https://github.com/yielded-dev/auth/commit/a0e201be286400fc8ae310cfe5e60b5cd2c0077e) Thanks [@danieljvdm](https://github.com/danieljvdm)! - Move Drizzle persistence and migration helpers into `@yielded/auth-persistence-drizzle`, leaving the default SQL package free of Drizzle dependencies and declarations.

  BEHAVIOR CHANGE: Import mappings from the companion root and drivers from explicit modules such as `@yielded/auth-persistence-drizzle/SqliteBun` instead of `@yielded/auth-persistence/drizzle/*`.

### Patch Changes

- [#36](https://github.com/yielded-dev/auth/pull/36) [`1253846`](https://github.com/yielded-dev/auth/commit/12538461669ff3921f9a582b2ec4905f499db726) Thanks [@danieljvdm](https://github.com/danieljvdm)! - Move maintained cryptography into `@yielded/auth-crypto`, leaving Effect as core's only runtime peer and preserving stored credential and ciphertext formats. BEHAVIOR CHANGE: supply password hashing, TOTP cryptography, and OAuth protector Layers from the companion package; move `digest`/`randomId` and TOTP crypto helper imports there, and provide OAuthApp protectors instead of passing `transactionKeys`/`tokenKeys` options.

- Updated dependencies [[`1253846`](https://github.com/yielded-dev/auth/commit/12538461669ff3921f9a582b2ec4905f499db726), [`39bfccb`](https://github.com/yielded-dev/auth/commit/39bfccb93d9a14108b0973694e799f70f26a40fe)]:
  - @yielded/auth@0.1.0-beta.10
  - @yielded/auth-crypto@0.1.0-beta.0

## 0.1.0-beta.9

### Minor Changes

- [#32](https://github.com/yielded-dev/auth/pull/32) [`85b10e7`](https://github.com/yielded-dev/auth/commit/85b10e7ee3c90d45721d7cbbc5125e30d8645167) Thanks [@danieljvdm](https://github.com/danieljvdm)! - Add OAuth authorization for registered MCP clients with browser consent, PKCE, scoped tokens, refresh rotation, and revocation. Protect Effect MCP routes with request authentication and persist grants through the standalone SQL adapter.

### Patch Changes

- [#30](https://github.com/yielded-dev/auth/pull/30) [`81b98eb`](https://github.com/yielded-dev/auth/commit/81b98eb6c7b046813d05a343697b460978f7d3df) Thanks [@danieljvdm](https://github.com/danieljvdm)! - Require Effect 4.0.0-rc.117, matching SQL drivers, and effect-cf 0.49.0 for Cloudflare integrations. Accept safe PostgreSQL `bigint` values in raw SQL mappings, release nested MySQL savepoints, and reject standalone persistence operations inside ambient libSQL transactions.

- Updated dependencies [[`81b98eb`](https://github.com/yielded-dev/auth/commit/81b98eb6c7b046813d05a343697b460978f7d3df), [`85b10e7`](https://github.com/yielded-dev/auth/commit/85b10e7ee3c90d45721d7cbbc5125e30d8645167)]:
  - @yielded/auth@0.1.0-beta.9

## 0.1.0-beta.8

### Minor Changes

- [#28](https://github.com/yielded-dev/auth/pull/28) [`9f88281`](https://github.com/yielded-dev/auth/commit/9f8828130424b45f8f74d462a4aac524e22511f2) Thanks [@danieljvdm](https://github.com/danieljvdm)! - Add managed OAuth sign-in that retains provider access and issues stateless application sessions, with GitHub and Strava adapters and SQL storage.
  Allow HTTP loopback callbacks for local OAuth development while requiring HTTPS for provider endpoints.

### Patch Changes

- Updated dependencies [[`9f88281`](https://github.com/yielded-dev/auth/commit/9f8828130424b45f8f74d462a4aac524e22511f2)]:
  - @yielded/auth@0.1.0-beta.8

## 0.1.0-beta.7

### Minor Changes

- [#26](https://github.com/yielded-dev/auth/pull/26) [`d1f2799`](https://github.com/yielded-dev/auth/commit/d1f279964029ac25e7a58dc6fe8ca29025bd4bd3) Thanks [@danieljvdm](https://github.com/danieljvdm)! - Move SQL adapters into `@yielded/auth-persistence` and add managed schemas, opt-in Layers for Drizzle Kit migrations, and direct Effect SQL persistence for password registration and recovery, email verification, phone sign-in, and stateful sessions.

  BEHAVIOR CHANGE: Import Drizzle adapters from `@yielded/auth-persistence/drizzle/*`; both packages now release together at the same version.

### Patch Changes

- [#26](https://github.com/yielded-dev/auth/pull/26) [`d1f2799`](https://github.com/yielded-dev/auth/commit/d1f279964029ac25e7a58dc6fe8ca29025bd4bd3) Thanks [@danieljvdm](https://github.com/danieljvdm)! - Add a runnable account example with application-declared Drizzle tables and Drizzle Kit migrations, including email verification and passkeys.

- [#26](https://github.com/yielded-dev/auth/pull/26) [`d1f2799`](https://github.com/yielded-dev/auth/commit/d1f279964029ac25e7a58dc6fe8ca29025bd4bd3) Thanks [@danieljvdm](https://github.com/danieljvdm)! - Preserve existing sessions when confirming an already-bound, unverified email address, and let application policy accept its valid session evidence. Omit `invalidation` from that completion result; retain recent-authentication and invalidation requirements when adding or replacing an address.

- [#26](https://github.com/yielded-dev/auth/pull/26) [`d1f2799`](https://github.com/yielded-dev/auth/commit/d1f279964029ac25e7a58dc6fe8ca29025bd4bd3) Thanks [@danieljvdm](https://github.com/danieljvdm)! - Preserve existing authentication when adding a passkey and allow application-defined authorization freshness limits.

  BEHAVIOR CHANGE: `PasskeyEnrolled` and `PasskeyManagementPersistence.completeEnrollment` no longer include `invalidation`; custom persistence must preserve the subject security revision during enrollment.

- [#26](https://github.com/yielded-dev/auth/pull/26) [`d1f2799`](https://github.com/yielded-dev/auth/commit/d1f279964029ac25e7a58dc6fe8ca29025bd4bd3) Thanks [@danieljvdm](https://github.com/danieljvdm)! - Compose Drizzle passkey sign-in and management storage from the Auth definition, with opt-in managed tables and migrations.

  BEHAVIOR CHANGE: Return Effects from `write.policy.requirement` and `write.policy.remainingSignIn` in explicit passkey mappings, for example `() => Effect.succeed(requirement)`.

- [#26](https://github.com/yielded-dev/auth/pull/26) [`d1f2799`](https://github.com/yielded-dev/auth/commit/d1f279964029ac25e7a58dc6fe8ca29025bd4bd3) Thanks [@danieljvdm](https://github.com/danieljvdm)! - Complete direct Effect SQL support for email verification and passkey sign-in and management. Add a runnable account example with application-owned SQLite or PostgreSQL migrations, email verification, recovery, and passkeys.

- Updated dependencies [[`d1f2799`](https://github.com/yielded-dev/auth/commit/d1f279964029ac25e7a58dc6fe8ca29025bd4bd3), [`d1f2799`](https://github.com/yielded-dev/auth/commit/d1f279964029ac25e7a58dc6fe8ca29025bd4bd3), [`d1f2799`](https://github.com/yielded-dev/auth/commit/d1f279964029ac25e7a58dc6fe8ca29025bd4bd3), [`d1f2799`](https://github.com/yielded-dev/auth/commit/d1f279964029ac25e7a58dc6fe8ca29025bd4bd3), [`d1f2799`](https://github.com/yielded-dev/auth/commit/d1f279964029ac25e7a58dc6fe8ca29025bd4bd3), [`d1f2799`](https://github.com/yielded-dev/auth/commit/d1f279964029ac25e7a58dc6fe8ca29025bd4bd3), [`5ccfe5a`](https://github.com/yielded-dev/auth/commit/5ccfe5a26e15351ff0b19b0199b858a9e22b889c), [`d1f2799`](https://github.com/yielded-dev/auth/commit/d1f279964029ac25e7a58dc6fe8ca29025bd4bd3), [`57427ef`](https://github.com/yielded-dev/auth/commit/57427ef4c086fa66a519c80944a24fa6c53d0885)]:
  - @yielded/auth@0.1.0-beta.7
