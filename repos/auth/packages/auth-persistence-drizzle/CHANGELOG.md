# @yielded/auth-persistence-drizzle

## 0.1.0-beta.42

### Patch Changes

- [#243](https://github.com/yielded-dev/auth/pull/243) [`0a0ff7d`](https://github.com/yielded-dev/auth/commit/0a0ff7d6d81d8b9e0aacd39ec81991b1f259e956) Thanks [@danieljvdm](https://github.com/danieljvdm)! - Preserve complete failure causes across authentication, persistence, provider, and native client boundaries, and report unexpected background and cleanup failures without exposing private data.
- Updated dependencies [[`0a0ff7d`](https://github.com/yielded-dev/auth/commit/0a0ff7d6d81d8b9e0aacd39ec81991b1f259e956)]:
  - @yielded/auth@0.1.0-beta.42
  - @yielded/auth-persistence@0.1.0-beta.42

## 0.1.0-beta.41

### Patch Changes

- Updated dependencies [[`ba7ccf2`](https://github.com/yielded-dev/auth/commit/ba7ccf23307cea88dcc20ee4b13f21561996a62c)]:
  - @yielded/auth@0.1.0-beta.41
  - @yielded/auth-persistence@0.1.0-beta.41

## 0.1.0-beta.40

### Patch Changes

- Updated dependencies [[`4ea887e`](https://github.com/yielded-dev/auth/commit/4ea887e2f77cd6e13defe1d445b892b45216b3ef)]:
  - @yielded/auth@0.1.0-beta.40
  - @yielded/auth-persistence@0.1.0-beta.40

## 0.1.0-beta.39

### Patch Changes

- [#235](https://github.com/yielded-dev/auth/pull/235) [`b81e273`](https://github.com/yielded-dev/auth/commit/b81e27309d9104157bbb119842276a5f7c41dc48) Thanks [@danieljvdm](https://github.com/danieljvdm)! - Import existing OAuth identities into composed persistence so migrated users sign in to their existing subjects. Expose the stable OAuth identity key for application-owned imports.
- Updated dependencies [[`b81e273`](https://github.com/yielded-dev/auth/commit/b81e27309d9104157bbb119842276a5f7c41dc48)]:
  - @yielded/auth-persistence@0.1.0-beta.39
  - @yielded/auth@0.1.0-beta.39

## 0.1.0-beta.38

### Patch Changes

- [#236](https://github.com/yielded-dev/auth/pull/236) [`0e77d70`](https://github.com/yielded-dev/auth/commit/0e77d70e99cd7221be4e388e30a34e99a5465a2f) Thanks [@danieljvdm](https://github.com/danieljvdm)! - Allow shared persistence Layers to initialize with the invoking request's SQL connection. Defer direct OAuth factory database access and required schema checks until the first operation.
- Updated dependencies [[`2186f4f`](https://github.com/yielded-dev/auth/commit/2186f4f649c72d3d37be7fcf25e10f097a4fcb04), [`0e77d70`](https://github.com/yielded-dev/auth/commit/0e77d70e99cd7221be4e388e30a34e99a5465a2f)]:
  - @yielded/auth@0.1.0-beta.38
  - @yielded/auth-persistence@0.1.0-beta.38

## 0.1.0-beta.37

### Patch Changes

- Updated dependencies [[`a37f2c9`](https://github.com/yielded-dev/auth/commit/a37f2c956afd791294329108e6d22b764958061f)]:
  - @yielded/auth@0.1.0-beta.37
  - @yielded/auth-persistence@0.1.0-beta.37

## 0.1.0-beta.36

### Patch Changes

- Updated dependencies [[`056a322`](https://github.com/yielded-dev/auth/commit/056a3225501b202dea9455bfe16e27221e10e63f)]:
  - @yielded/auth-persistence@0.1.0-beta.36
  - @yielded/auth@0.1.0-beta.36

## 0.1.0-beta.35

### Patch Changes

- [#221](https://github.com/yielded-dev/auth/pull/221) [`d80c822`](https://github.com/yielded-dev/auth/commit/d80c822f78e6e2d0d2bb44d93b579f08dcedb4b0) Thanks [@danieljvdm](https://github.com/danieljvdm)! - Include non-unique indexes for managed credential, identifier, session, and pending-authentication lookups. Generate and apply the corresponding database migration to use the indexes.

- [#215](https://github.com/yielded-dev/auth/pull/215) [`2f5c39b`](https://github.com/yielded-dev/auth/commit/2f5c39bf23e71aa8c697079e0744633d69901354) Thanks [@danieljvdm](https://github.com/danieljvdm)! - Read only subject identity, status, and security revision during stateful session verification and inventory. Preserve complete subject rows for authentication policy callbacks.
- Updated dependencies [[`439f879`](https://github.com/yielded-dev/auth/commit/439f87934f010ed15d3ba08a2cdc7c6dcb64d0ac), [`b97748f`](https://github.com/yielded-dev/auth/commit/b97748f6f655d836107184a5f982ea75abc0ea98), [`1f648ae`](https://github.com/yielded-dev/auth/commit/1f648ae827a81fd3d17da28d93548245a43e2538), [`172e9d1`](https://github.com/yielded-dev/auth/commit/172e9d1f975190e8015d7d583b83f5ef7e6d925b), [`d80c822`](https://github.com/yielded-dev/auth/commit/d80c822f78e6e2d0d2bb44d93b579f08dcedb4b0), [`2f5c39b`](https://github.com/yielded-dev/auth/commit/2f5c39bf23e71aa8c697079e0744633d69901354), [`5875575`](https://github.com/yielded-dev/auth/commit/5875575c9c62f6d755734f3874e13ca654c8d3bd), [`7f47bce`](https://github.com/yielded-dev/auth/commit/7f47bce67b8e0c7a49a6f2421cf09667a4b5f044), [`948a3f1`](https://github.com/yielded-dev/auth/commit/948a3f12295b59c0bc560941edbbef59cc0b77b9), [`9bc7083`](https://github.com/yielded-dev/auth/commit/9bc7083ced9992ed428c61f45163217b09857079), [`860d90d`](https://github.com/yielded-dev/auth/commit/860d90d35a8cc5e2197276ecde65636bed48ac46), [`b86c41e`](https://github.com/yielded-dev/auth/commit/b86c41e562a9f623d2f3f7f6fa6d9a9835b5fbb8), [`e368c21`](https://github.com/yielded-dev/auth/commit/e368c21e51bea214efb41158aec4585c8db509a2), [`1a65155`](https://github.com/yielded-dev/auth/commit/1a65155dec67dd4cf6d114132759e93e758d01db), [`56cef27`](https://github.com/yielded-dev/auth/commit/56cef272b938592ea8e05409ce040f3ec4305c74), [`fbc58e3`](https://github.com/yielded-dev/auth/commit/fbc58e3343b140743e24c7a061bcf38985c45383), [`fd5d9e6`](https://github.com/yielded-dev/auth/commit/fd5d9e68803180acc9566317f4578a9f55b30f84)]:
  - @yielded/auth-persistence@0.1.0-beta.35
  - @yielded/auth@0.1.0-beta.35

## 0.1.0-beta.34

### Patch Changes

- [#203](https://github.com/yielded-dev/auth/pull/203) [`5264de7`](https://github.com/yielded-dev/auth/commit/5264de78aee570c82718b2841ec38ea17544fa3e) Thanks [@danieljvdm](https://github.com/danieljvdm)! - Support Effect 4.0.3 across authentication workflows and companion packages. Require Effect 4.0.3 or later.
- Updated dependencies [[`5264de7`](https://github.com/yielded-dev/auth/commit/5264de78aee570c82718b2841ec38ea17544fa3e)]:
  - @yielded/auth@0.1.0-beta.34
  - @yielded/auth-persistence@0.1.0-beta.34

## 0.1.0-beta.33

### Patch Changes

- Updated dependencies [[`b9b43e2`](https://github.com/yielded-dev/auth/commit/b9b43e24f6fedda4168cfb65b081c296ffd9233f), [`c9787f7`](https://github.com/yielded-dev/auth/commit/c9787f731dc64870f0ace15fa4e6edd3a3f13ff8), [`0ad3e4c`](https://github.com/yielded-dev/auth/commit/0ad3e4cc67a954e3a2f20aae9491e1608fd5ccea), [`2326161`](https://github.com/yielded-dev/auth/commit/232616128ad88418c375de9256614d37053c76e2), [`881f94d`](https://github.com/yielded-dev/auth/commit/881f94d31c9dfd3119bb2544925f9ee1d8b78368), [`0ee8f41`](https://github.com/yielded-dev/auth/commit/0ee8f415dc72d5ab750fb6813d783840c8ec65c5)]:
  - @yielded/auth@0.1.0-beta.33
  - @yielded/auth-persistence@0.1.0-beta.33

## 0.1.0-beta.32

### Minor Changes

- [#190](https://github.com/yielded-dev/auth/pull/190) [`a33138f`](https://github.com/yielded-dev/auth/commit/a33138fd6fb853fd6763b3618bd93e3204f94dc2) Thanks [@danieljvdm](https://github.com/danieljvdm)! - Add opt-in authentication after the first confirmed OAuth registration, including pending MFA, while keeping default registration and every replay metadata-only.

### Patch Changes

- [#189](https://github.com/yielded-dev/auth/pull/189) [`93eab41`](https://github.com/yielded-dev/auth/commit/93eab4198349a9cfbfec73e66ca601701cd7c685) Thanks [@danieljvdm](https://github.com/danieljvdm)! - Apply one opt-in future-clock policy across Auth, SQL sessions, and protected password and passkey actions while preserving strict freshness and expiry. **BEHAVIOR CHANGE:** Custom `AuthenticationAuthority.approve` implementations must validate the prepared `issuedAt` supplied by Auth.

- [#186](https://github.com/yielded-dev/auth/pull/186) [`2482c7e`](https://github.com/yielded-dev/auth/commit/2482c7edd89106c31189237ae7d04e2696dc7fe9) Thanks [@danieljvdm](https://github.com/danieljvdm)! - Allow composed SQL persistence alongside explicit strategy services, and safely read mapped SQL IDs with differing physical types. Keep passkey, session, and pending-authentication reads coherent across independently bound SQL mappings, including session pagination during authority changes.

- [#195](https://github.com/yielded-dev/auth/pull/195) [`4c74ac6`](https://github.com/yielded-dev/auth/commit/4c74ac6325d14e4681c989acaa23760fe746728d) Thanks [@danieljvdm](https://github.com/danieljvdm)! - Support composed managed OAuth sign-in and retained provider grants across the PostgreSQL and SQLite adapters, including D1. Allow OAuth-only compositions to use stateless sessions.

- [#191](https://github.com/yielded-dev/auth/pull/191) [`dfdc622`](https://github.com/yielded-dev/auth/commit/dfdc622a346622474ca9a34f6215ee070cd718fc) Thanks [@danieljvdm](https://github.com/danieljvdm)! - Add opt-in, sanitized Debug diagnostics and preserve request logging and tracing without changing authentication outcomes or retry guarantees.
- Updated dependencies [[`32b9eb9`](https://github.com/yielded-dev/auth/commit/32b9eb9aad6945bc6065ca7c33857fd7d7627a32), [`93eab41`](https://github.com/yielded-dev/auth/commit/93eab4198349a9cfbfec73e66ca601701cd7c685), [`2482c7e`](https://github.com/yielded-dev/auth/commit/2482c7edd89106c31189237ae7d04e2696dc7fe9), [`4c74ac6`](https://github.com/yielded-dev/auth/commit/4c74ac6325d14e4681c989acaa23760fe746728d), [`a33138f`](https://github.com/yielded-dev/auth/commit/a33138fd6fb853fd6763b3618bd93e3204f94dc2), [`dfdc622`](https://github.com/yielded-dev/auth/commit/dfdc622a346622474ca9a34f6215ee070cd718fc)]:
  - @yielded/auth@0.1.0-beta.32
  - @yielded/auth-persistence@0.1.0-beta.32

## 0.1.0-beta.31

### Patch Changes

- [#173](https://github.com/yielded-dev/auth/pull/173) [`c1ee305`](https://github.com/yielded-dev/auth/commit/c1ee305ecee0c19b20a0543eced9a39bb962161c) Thanks [@danieljvdm](https://github.com/danieljvdm)! - Add managed and mapped D1 storage through `AuthPersistence` from `@yielded/auth-persistence-drizzle/D1`, with atomic batches and a migration Layer. Support password registration and management with subject-value provisioning across managed drivers.
- Updated dependencies [[`759c6e7`](https://github.com/yielded-dev/auth/commit/759c6e73612d90a11d092f3c30cf8ddc3a1c0cdc), [`c1ee305`](https://github.com/yielded-dev/auth/commit/c1ee305ecee0c19b20a0543eced9a39bb962161c), [`b5388b6`](https://github.com/yielded-dev/auth/commit/b5388b6e4bc0ebadf10e97367c09638ba17724e0), [`a1c5555`](https://github.com/yielded-dev/auth/commit/a1c555586cdf5415530ea71e08b25da3063772a3), [`dcf1691`](https://github.com/yielded-dev/auth/commit/dcf16913160299793e4ef460a41d390950661a7a)]:
  - @yielded/auth@0.1.0-beta.31
  - @yielded/auth-persistence@0.1.0-beta.31

## 0.1.0-beta.30

### Minor Changes

- [#161](https://github.com/yielded-dev/auth/pull/161) [`989f88c`](https://github.com/yielded-dev/auth/commit/989f88ca1a7f46ec73702330827c555b776d8206) Thanks [@danieljvdm](https://github.com/danieljvdm)! - Expose paginated linked OAuth login identities through Auth, HTTP clients, and Effect Atom queries. Add `metadataAccess` to SQL/Drizzle account mappings and `list` to replacement account persistence services.

### Patch Changes

- Updated dependencies [[`989f88c`](https://github.com/yielded-dev/auth/commit/989f88ca1a7f46ec73702330827c555b776d8206), [`8e5b5d1`](https://github.com/yielded-dev/auth/commit/8e5b5d173f82c98ad1fcd644b9d18d91c59d9a43), [`193317e`](https://github.com/yielded-dev/auth/commit/193317e9a3e7f6645424ff6da8f9ce7d3d40657e)]:
  - @yielded/auth@0.1.0-beta.30
  - @yielded/auth-persistence@0.1.0-beta.30

## 0.1.0-beta.29

### Patch Changes

- Updated dependencies [[`167f725`](https://github.com/yielded-dev/auth/commit/167f7256fa634430f442eb6f1e0a04595c605370)]:
  - @yielded/auth@0.1.0-beta.29
  - @yielded/auth-persistence@0.1.0-beta.29

## 0.1.0-beta.28

### Patch Changes

- Updated dependencies [[`7a5b241`](https://github.com/yielded-dev/auth/commit/7a5b241f18f976271142e39fc523ba266ec4bbb0)]:
  - @yielded/auth@0.1.0-beta.28
  - @yielded/auth-persistence@0.1.0-beta.28

## 0.1.0-beta.27

### Patch Changes

- [#154](https://github.com/yielded-dev/auth/pull/154) [`a8f2460`](https://github.com/yielded-dev/auth/commit/a8f2460f92d652fd5ba97e61da939cf7c6790bc3) Thanks [@danieljvdm](https://github.com/danieljvdm)! - Allow PostgreSQL and SQLite Drizzle adapters to load without installing the optional MySQL driver.
- Updated dependencies []:
  - @yielded/auth@0.1.0-beta.27
  - @yielded/auth-persistence@0.1.0-beta.27

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

- [#152](https://github.com/yielded-dev/auth/pull/152) [`9b6ffb6`](https://github.com/yielded-dev/auth/commit/9b6ffb62679862890cbbb6604bdada5827c00400) Thanks [@danieljvdm](https://github.com/danieljvdm)! - Use shared native SQL workflows through mapped tables or `NativeSqlTables`, with far fewer database round trips per operation. BEHAVIOR CHANGE: update custom adapters to the current `/Adapter` exports and replace removed query-kernel, observation-fence, and legacy transaction helpers.

- [#151](https://github.com/yielded-dev/auth/pull/151) [`821d0a2`](https://github.com/yielded-dev/auth/commit/821d0a222aca754d1b3e2928dab0b6b9cd23b0d1) Thanks [@danieljvdm](https://github.com/danieljvdm)! - Reuse authoritative session and factor snapshots within a request, preserve fresh step-up assurance without extending absolute expiry, and keep existing sessions when regenerating recovery codes. BEHAVIOR CHANGE: reset development session and pending state, map current subject policy and shared pending kinds, implement bounded browser-login cleanup, and replace removed strategy verification, preparation, row-version and flow-deduplication contracts.

- [#152](https://github.com/yielded-dev/auth/pull/152) [`9b6ffb6`](https://github.com/yielded-dev/auth/commit/9b6ffb62679862890cbbb6604bdada5827c00400) Thanks [@danieljvdm](https://github.com/danieljvdm)! - Reuse the captured OAuth grant for token-use authorization and conditional refresh claims. BEHAVIOR CHANGE: update custom use authorities to accept the supplied snapshot, custom persistence to claim the exact stored grant, and OAuth mappings to remove `decodeActionRequirement`.

- [#146](https://github.com/yielded-dev/auth/pull/146) [`730d296`](https://github.com/yielded-dev/auth/commit/730d296952af8473be2701eb33b404a8f02f9429) Thanks [@danieljvdm](https://github.com/danieljvdm)! - Keep cached session reads database-free by deferring composed SQL persistence initialization until its first storage operation. Start cookie caching automatically for existing browser sessions after enabling `cacheFor`, without requiring another sign-in or renewal.
- Updated dependencies [[`03b57e3`](https://github.com/yielded-dev/auth/commit/03b57e3186eb3bed3e4207ae7cf1a82f9ebbc349), [`03b57e3`](https://github.com/yielded-dev/auth/commit/03b57e3186eb3bed3e4207ae7cf1a82f9ebbc349), [`9b6ffb6`](https://github.com/yielded-dev/auth/commit/9b6ffb62679862890cbbb6604bdada5827c00400), [`821d0a2`](https://github.com/yielded-dev/auth/commit/821d0a222aca754d1b3e2928dab0b6b9cd23b0d1), [`9b6ffb6`](https://github.com/yielded-dev/auth/commit/9b6ffb62679862890cbbb6604bdada5827c00400), [`dcdce5a`](https://github.com/yielded-dev/auth/commit/dcdce5a7c23647b58206974bdc4101b45d0df37f), [`dcdce5a`](https://github.com/yielded-dev/auth/commit/dcdce5a7c23647b58206974bdc4101b45d0df37f), [`730d296`](https://github.com/yielded-dev/auth/commit/730d296952af8473be2701eb33b404a8f02f9429), [`dcdce5a`](https://github.com/yielded-dev/auth/commit/dcdce5a7c23647b58206974bdc4101b45d0df37f)]:
  - @yielded/auth@0.1.0-beta.26
  - @yielded/auth-persistence@0.1.0-beta.26

## 0.1.0-beta.25

### Patch Changes

- [#143](https://github.com/yielded-dev/auth/pull/143) [`5d5f461`](https://github.com/yielded-dev/auth/commit/5d5f461a17587c1bde74d9ed667efe4bd85c888d) Thanks [@danieljvdm](https://github.com/danieljvdm)! - Add opt-in stateful session cookie caching with bounded staleness, authoritative fresh reads, and diagnostics for cache failures. Default session signing keys from the application secret in `Auth.AuthConfig` or `AUTH_SECRET`.

  BEHAVIOR CHANGE: Configure the application secret or override `Sessions.SessionSigningKeys` instead of passing constructor keys. `getSession({ fresh: true })` bypasses caching; its HTTP route now uses POST, and its Atom binding is a family (`auth.session` remains the default query). Handle `cache-expiry` invalidation windows and include `session-cache` in custom credential-slot and native-header mappings.

- Updated dependencies [[`5d5f461`](https://github.com/yielded-dev/auth/commit/5d5f461a17587c1bde74d9ed667efe4bd85c888d)]:
  - @yielded/auth@0.1.0-beta.25
  - @yielded/auth-persistence@0.1.0-beta.25

## 0.1.0-beta.24

### Minor Changes

- [#137](https://github.com/yielded-dev/auth/pull/137) [`ade1bda`](https://github.com/yielded-dev/auth/commit/ade1bdaec762f291aad1fc5aac0e68684a940ddc) Thanks [@danieljvdm](https://github.com/danieljvdm)! - Add a stable OAuth callback proxy for registered local and preview environments, with single-use handoffs and independent local sessions. Provide encrypted proxy storage with direct SQL and Drizzle adapters for SQLite, D1, and PostgreSQL.

### Patch Changes

- [#141](https://github.com/yielded-dev/auth/pull/141) [`5548472`](https://github.com/yielded-dev/auth/commit/5548472bf692196cababcd4fedcd559c2f0ef145) Thanks [@danieljvdm](https://github.com/danieljvdm)! - Reduce SQL session verification to one read for compatible stateful mappings and state-assisted validity, preserving immediate invalidation. Retain safe fallbacks for custom codecs and physical column differences, and preserve caller transactions after verification errors.

- [#142](https://github.com/yielded-dev/auth/pull/142) [`d980ff1`](https://github.com/yielded-dev/auth/commit/d980ff1e5f227fe3668052eb4f9852fd4e80ea73) Thanks [@danieljvdm](https://github.com/danieljvdm)! - Persist upstream OAuth sign-in, registration, linked accounts, and retained grants through explicit Effect SQL mappings on PostgreSQL and SQLite. Share OAuth operations and storage contracts with the Drizzle adapters.

- [#138](https://github.com/yielded-dev/auth/pull/138) [`009ae06`](https://github.com/yielded-dev/auth/commit/009ae060b1c5807e1948bcf399137f3081dd7388) Thanks [@danieljvdm](https://github.com/danieljvdm)! - Remove durable password attempts and fresh password sign-in flow writes while retaining commit-time authority checks. BEHAVIOR CHANGE: replace custom password admission/settlement/cleanup with `findCredential` and `rehashIfCurrent`, remove attempt mappings and `attemptLifetimeMillis`, return `{ revision, requirement }` from `AuthenticationAuthority.capture`, and honor fresh session issuance in custom stores; obsolete password attempt tables can be dropped without resetting credentials or sessions.
- Updated dependencies [[`d980ff1`](https://github.com/yielded-dev/auth/commit/d980ff1e5f227fe3668052eb4f9852fd4e80ea73), [`5548472`](https://github.com/yielded-dev/auth/commit/5548472bf692196cababcd4fedcd559c2f0ef145), [`d980ff1`](https://github.com/yielded-dev/auth/commit/d980ff1e5f227fe3668052eb4f9852fd4e80ea73), [`009ae06`](https://github.com/yielded-dev/auth/commit/009ae060b1c5807e1948bcf399137f3081dd7388), [`33a3f3d`](https://github.com/yielded-dev/auth/commit/33a3f3d7c0a33c9b55bfc080ea5aad29c2d2f3f0), [`ade1bda`](https://github.com/yielded-dev/auth/commit/ade1bdaec762f291aad1fc5aac0e68684a940ddc), [`33a3f3d`](https://github.com/yielded-dev/auth/commit/33a3f3d7c0a33c9b55bfc080ea5aad29c2d2f3f0)]:
  - @yielded/auth@0.1.0-beta.24
  - @yielded/auth-persistence@0.1.0-beta.24

## 0.1.0-beta.23

### Patch Changes

- [#134](https://github.com/yielded-dev/auth/pull/134) [`d7e48cd`](https://github.com/yielded-dev/auth/commit/d7e48cd2593e93b5af23456f00ed48688aa5a509) Thanks [@danieljvdm](https://github.com/danieljvdm)! - Check coordinated password mutations and password-reset proof completion again after application work, in interactive transactions and D1 batches, and compare a written password's persisted values exactly.

- [#129](https://github.com/yielded-dev/auth/pull/129) [`0fb0a5d`](https://github.com/yielded-dev/auth/commit/0fb0a5da1e395c579ac67d6fc9389dc5267cb0ea) Thanks [@danieljvdm](https://github.com/danieljvdm)! - Share password attempt persistence through native Effect SQL and use bounded process-local password rate limits with replaceable shared storage. BEHAVIOR CHANGE: supply a shared `RateLimiterStore` for multi-instance limits, replace custom `admitAttempt` implementations with `prepareAttempt`, and remove password rate-table mappings and the password `maximumPending` setting.
- Updated dependencies [[`2742351`](https://github.com/yielded-dev/auth/commit/27423515058032699f392712391321406cf2aa0e), [`d7e48cd`](https://github.com/yielded-dev/auth/commit/d7e48cd2593e93b5af23456f00ed48688aa5a509), [`aa8ba53`](https://github.com/yielded-dev/auth/commit/aa8ba53ff87b9905eb62e2663a4f888bbabfbb56), [`0fb0a5d`](https://github.com/yielded-dev/auth/commit/0fb0a5da1e395c579ac67d6fc9389dc5267cb0ea)]:
  - @yielded/auth@0.1.0-beta.23
  - @yielded/auth-persistence@0.1.0-beta.23

## 0.1.0-beta.22

### Patch Changes

- Updated dependencies [[`1d4c0db`](https://github.com/yielded-dev/auth/commit/1d4c0db87517455eb1d7eef10e802b61650189dc)]:
  - @yielded/auth@0.1.0-beta.22
  - @yielded/auth-persistence@0.1.0-beta.22

## 0.1.0-beta.21

### Patch Changes

- Updated dependencies [[`412c808`](https://github.com/yielded-dev/auth/commit/412c808796a1a52ee0dd568f9a88433d6a9ef2d4)]:
  - @yielded/auth@0.1.0-beta.21
  - @yielded/auth-persistence@0.1.0-beta.21

## 0.1.0-beta.20

### Patch Changes

- Updated dependencies [[`3d6d331`](https://github.com/yielded-dev/auth/commit/3d6d331856712cbc4804cf0c495f01bb3124b38b)]:
  - @yielded/auth@0.1.0-beta.20
  - @yielded/auth-persistence@0.1.0-beta.20

## 0.1.0-beta.19

### Minor Changes

- [#107](https://github.com/yielded-dev/auth/pull/107) [`c4752e3`](https://github.com/yielded-dev/auth/commit/c4752e34b3b6f3a4f53270727fbdc3050d65935a) Thanks [@danieljvdm](https://github.com/danieljvdm)! - Add reusable Effect crypto, Schema-typed JOSE, and OAuth/OIDC packages, and adopt them throughout Auth without changing stored credential formats. Remove unnecessary signing-service requirements from GitHub and use scoped HMAC keys for sessions and numeric proofs.

  BEHAVIOR CHANGE: Replace the former crypto/OpenID adapter imports with Auth's direct service Layers and `OpenIdConnect`/`GitHub` modules, supplying crypto and HTTP services explicitly. Implement scoped `Hmac.importKey` in custom backends, replace Auth `SubtleCrypto` overrides with `Hmac` Layers, and keep direct session/numeric-proof crypto constructors in an open Scope. Set managed storage's `prefix`, yield `Adapter.makeStorageMappings(storage)` with Effect Crypto supplied, and wrap application-owned Durable Object Drizzle databases with `SqliteDo.makeDatabase` for asynchronous transactions.

### Patch Changes

- [#107](https://github.com/yielded-dev/auth/pull/107) [`c4752e3`](https://github.com/yielded-dev/auth/commit/c4752e34b3b6f3a4f53270727fbdc3050d65935a) Thanks [@danieljvdm](https://github.com/danieljvdm)! - Require application-supplied crypto Layers throughout Auth and acquire storage-mapping dependencies through Effect requirements. Remove the unused Hmac requirement from JWKS and OIDC verification.

  BEHAVIOR CHANGE: Replace `Persistence.cryptoLayer` with your selected backend and provide it to the Auth Layer. Yield `Adapter.makeStorageMappings(storage)` inside an Effect with `Crypto` supplied.

- [#117](https://github.com/yielded-dev/auth/pull/117) [`c0d5475`](https://github.com/yielded-dev/auth/commit/c0d5475a3251351fb081164b4c61594bc1ff6439) Thanks [@danieljvdm](https://github.com/danieljvdm)! - Reduce SQL persistence acquisition latency across PostgreSQL, SQLite, MySQL and D1 while continuing to reject missing columns and unique keys. Avoid repeated passkey initialization writes when current policy and admission ownership already match.

- Updated dependencies [[`c4752e3`](https://github.com/yielded-dev/auth/commit/c4752e34b3b6f3a4f53270727fbdc3050d65935a), [`c4752e3`](https://github.com/yielded-dev/auth/commit/c4752e34b3b6f3a4f53270727fbdc3050d65935a), [`c4752e3`](https://github.com/yielded-dev/auth/commit/c4752e34b3b6f3a4f53270727fbdc3050d65935a), [`c0d5475`](https://github.com/yielded-dev/auth/commit/c0d5475a3251351fb081164b4c61594bc1ff6439)]:
  - @yielded/auth@0.1.0-beta.19
  - @yielded/auth-persistence@0.1.0-beta.19

## 0.1.0-beta.18

### Patch Changes

- [#110](https://github.com/yielded-dev/auth/pull/110) [`b904442`](https://github.com/yielded-dev/auth/commit/b904442510ec0b5412e4be81933a4e1523e16260) Thanks [@goknsh](https://github.com/goknsh)! - Support TypeScript consumers with `exactOptionalPropertyTypes` enabled, including the default session lifecycle actions.

- Updated dependencies [[`9aaaa55`](https://github.com/yielded-dev/auth/commit/9aaaa55fff9e7bf7236036ba3fe8b84337eb3eae), [`b904442`](https://github.com/yielded-dev/auth/commit/b904442510ec0b5412e4be81933a4e1523e16260), [`a9009bf`](https://github.com/yielded-dev/auth/commit/a9009bf44c935946f7e8acde1a0073ef0239542a)]:
  - @yielded/auth@0.1.0-beta.18
  - @yielded/auth-persistence@0.1.0-beta.18
  - @yielded/auth-crypto@0.1.0-beta.18

## 0.1.0-beta.17

### Patch Changes

- Updated dependencies [[`2d6f361`](https://github.com/yielded-dev/auth/commit/2d6f361813bfa8523451120eddabcd801b83ab6d)]:
  - @yielded/auth@0.1.0-beta.17
  - @yielded/auth-crypto@0.1.0-beta.17
  - @yielded/auth-persistence@0.1.0-beta.17

## 0.1.0-beta.16

### Patch Changes

- Updated dependencies [[`a070c44`](https://github.com/yielded-dev/auth/commit/a070c44a4c86f79e2782119e74d7eae3ae064542)]:
  - @yielded/auth@0.1.0-beta.16
  - @yielded/auth-crypto@0.1.0-beta.16
  - @yielded/auth-persistence@0.1.0-beta.16

## 0.1.0-beta.15

### Patch Changes

- [#97](https://github.com/yielded-dev/auth/pull/97) [`2400d10`](https://github.com/yielded-dev/auth/commit/2400d10c2bcdf14d76b9b5c2e02a6f39e67911e9) Thanks [@danieljvdm](https://github.com/danieljvdm)! - Validate explicit Drizzle mappings against the captured database's physical unique keys before acquiring services or transaction coordinators.

  BEHAVIOR CHANGE: Apply application migrations before building adapter Layers and permit database catalog reads; declared constraints alone no longer satisfy acquisition.

- [#73](https://github.com/yielded-dev/auth/pull/73) [`27126ab`](https://github.com/yielded-dev/auth/commit/27126ab493f71260416c623380ab3fcbe0ed8596) Thanks [@danieljvdm](https://github.com/danieljvdm)! - Prepare connected OAuth flows before verifying independent exact-action evidence, and resolve begin, callback and disconnect targets through private server services. **BEHAVIOR CHANGE:** call `prepareBegin` before `begin`, retain its private `connected-intent` credential and original command inputs, map credentials through Operation HTTP, and update custom persistence and transaction protectors for prepared flows and their connected envelopes.

- [#71](https://github.com/yielded-dev/auth/pull/71) [`ac61865`](https://github.com/yielded-dev/auth/commit/ac61865b374c03e2046cbfb3e8fb6a824893fb4e) Thanks [@danieljvdm](https://github.com/danieljvdm)! - Add system-browser sign-in for Electron and iOS apps with separate native sessions and configurable browser-session reuse. Keep Apple association setup optional and application-owned.

- [#84](https://github.com/yielded-dev/auth/pull/84) [`841d4c8`](https://github.com/yielded-dev/auth/commit/841d4c809e282ad10214a6abac570b1b45a263b1) Thanks [@danieljvdm](https://github.com/danieljvdm)! - Protect active codes and reset links from other request attempts, charge only issued proofs, provide configurable request rate limiting by default, and expose `Adapter.makeStorageMappings` for adapter composition. BEHAVIOR CHANGE: supply `Proofs.ProofRequestContext` for non-HTTP calls and provide raw HTTP operation handlers, codecs, and callback services at `server.handle` invocation; standard Auth HTTP routes supply the caller automatically.

- [#85](https://github.com/yielded-dev/auth/pull/85) [`5b6d202`](https://github.com/yielded-dev/auth/commit/5b6d202a9278bfb197fa06624101227c44efbe36) Thanks [@danieljvdm](https://github.com/danieljvdm)! - Allow proof-based email registration to reclaim an unverified address for a fresh account while preserving the earlier account's data and invalidating its authentication revision.

- Updated dependencies [[`2400d10`](https://github.com/yielded-dev/auth/commit/2400d10c2bcdf14d76b9b5c2e02a6f39e67911e9), [`27126ab`](https://github.com/yielded-dev/auth/commit/27126ab493f71260416c623380ab3fcbe0ed8596), [`1650b34`](https://github.com/yielded-dev/auth/commit/1650b34275537a11fe629bc0fd7d749c023a05f0), [`d5e1f04`](https://github.com/yielded-dev/auth/commit/d5e1f0491732f30f10eea308667942be6aa51286), [`877f025`](https://github.com/yielded-dev/auth/commit/877f0256f2f3760b6f909f41f0985ac311149000), [`ac61865`](https://github.com/yielded-dev/auth/commit/ac61865b374c03e2046cbfb3e8fb6a824893fb4e), [`328b136`](https://github.com/yielded-dev/auth/commit/328b136ef2be59cc4763d861a26ae8af4e96b3cd), [`b5c46a1`](https://github.com/yielded-dev/auth/commit/b5c46a1e30a6f80c65a4a15f14354fc6c78e29eb), [`841d4c8`](https://github.com/yielded-dev/auth/commit/841d4c809e282ad10214a6abac570b1b45a263b1), [`e4c0408`](https://github.com/yielded-dev/auth/commit/e4c04089921f2363ae325c7dd8c0f50e0685c860), [`0140ee4`](https://github.com/yielded-dev/auth/commit/0140ee42ba96e49f7753bd8a9de3f8739576dd42), [`b2d82cb`](https://github.com/yielded-dev/auth/commit/b2d82cb59b2d19c2dad2dbc773ced8e6494955e4), [`5aa13b0`](https://github.com/yielded-dev/auth/commit/5aa13b0153d0be0613c3c51d7c442c719b1fe9bd), [`ddeeb6d`](https://github.com/yielded-dev/auth/commit/ddeeb6d47d12b029afa33742cf93aab6e1fe9dcf)]:
  - @yielded/auth-persistence@0.1.0-beta.15
  - @yielded/auth@0.1.0-beta.15
  - @yielded/auth-crypto@0.1.0-beta.15

## 0.1.0-beta.14

### Patch Changes

- Updated dependencies [[`b0ef3d8`](https://github.com/yielded-dev/auth/commit/b0ef3d8ffcb1cebca66db115a2f6fd5f3cc4d5ab)]:
  - @yielded/auth@0.1.0-beta.14
  - @yielded/auth-crypto@0.1.0-beta.14
  - @yielded/auth-persistence@0.1.0-beta.14

## 0.1.0-beta.13

### Patch Changes

- [#59](https://github.com/yielded-dev/auth/pull/59) [`1c4df1c`](https://github.com/yielded-dev/auth/commit/1c4df1c52668d64b5e3d909cd03a025e88966e6a) Thanks [@danieljvdm](https://github.com/danieljvdm)! - Release password admission after attempt retention, page phone admission cleanup, and resolve an OAuth reservation when the provider issues no token.

  Keep request resources and post-commit hooks on the caller, report password outages as unavailable, and reuse each issuer's JWKS cache.

  BEHAVIOR CHANGE: Clear unresolved reservations left by earlier definite provider rejections if a cohort stays blocked. Password attempts need no reset.

- Updated dependencies [[`1c4df1c`](https://github.com/yielded-dev/auth/commit/1c4df1c52668d64b5e3d909cd03a025e88966e6a), [`1081d5b`](https://github.com/yielded-dev/auth/commit/1081d5b4003e9819e412c753273344ad00d47fc2)]:
  - @yielded/auth@0.1.0-beta.13
  - @yielded/auth-persistence@0.1.0-beta.13
  - @yielded/auth-crypto@0.1.0-beta.13

## 0.1.0-beta.12

### Minor Changes

- [#56](https://github.com/yielded-dev/auth/pull/56) [`67c8eff`](https://github.com/yielded-dev/auth/commit/67c8effd7b61ffb677e2a151d320ac308649fd12) Thanks [@danieljvdm](https://github.com/danieljvdm)! - Acquire database, transport, credential-store, and private-output dependencies through Effect services. BEHAVIOR CHANGE: provide each Drizzle driver's `Database` through `databaseLayer` and call its factories with mappings only; provide `Current*Sql` or `NativeDatabase` when acquiring shared Adapter services; select client stores by service key, provide `OperationHttpClient.Client` to `AuthAtom.makeLifetime(options)`, and supply OpenID fetch overrides through `FetchHttpClient.Fetch`.

### Patch Changes

- Align all public packages on a single beta version and release them together.

- Updated dependencies [[`67c8eff`](https://github.com/yielded-dev/auth/commit/67c8effd7b61ffb677e2a151d320ac308649fd12)]:
  - @yielded/auth@0.1.0-beta.12
  - @yielded/auth-crypto@0.1.0-beta.12
  - @yielded/auth-persistence@0.1.0-beta.12

## 0.1.0-beta.1

### Minor Changes

- [#43](https://github.com/yielded-dev/auth/pull/43) [`4973533`](https://github.com/yielded-dev/auth/commit/49735334149d3d29a34542047a27ff6fffac9f7e) Thanks [@danieljvdm](https://github.com/danieljvdm)! - Consolidate password, email, and session authentication on `Auth.make` and the strategy modules, and remove the superseded workflows, HTTP/RPC integration, OAuth linking service, and store adapters. Replace Cloudflare OTP delivery with `layerEmailProofDelivery` for the shared proof engine.

  BEHAVIOR CHANGE: Replace `PasswordAuth`, `EmailOtp`, `AuthSession`, `Workflows`, `HttpServer`, and their support services with the current strategies, `Sessions`, `Http`, and `AuthPersistence`; use `OAuth.makeAccounts` / `OAuth.makeConnected` for provider linking and access. Retired challenge, registration, OAuth-state records, and session cookies are incompatible; reset only that development state and reauthenticate, and explicitly import application identities and credentials if keeping existing accounts.

- [#45](https://github.com/yielded-dev/auth/pull/45) [`156f0b3`](https://github.com/yielded-dev/auth/commit/156f0b3b01a60bb21f9984d6d464d05f73b79283) Thanks [@danieljvdm](https://github.com/danieljvdm)! - Retain provider access through `OAuth.make({ access: profile })` with shared Auth sessions, grant storage, refresh, and disconnect; remove OAuthApp and its separate persistence adapter.

  BEHAVIOR CHANGE: Reset development OAuthApp cookies/flows/grants and older connected token envelopes, then configure the shared sign-in and connected services; preserve account identities and outstanding reconciliation receipts.

### Patch Changes

- [#52](https://github.com/yielded-dev/auth/pull/52) [`4dbe837`](https://github.com/yielded-dev/auth/commit/4dbe837e23399e1e659c3b6eb7d2a041b5653de0) Thanks [@danieljvdm](https://github.com/danieljvdm)! - Require stable Effect and matching SQL drivers, and update Cloudflare integration to effect-cf 0.53. Support Drizzle RC4 with the temporary Drizzle patch CLI when adding Drizzle to an existing Bun app.

- Updated dependencies [[`b9967b8`](https://github.com/yielded-dev/auth/commit/b9967b8326404a72fc5378c268ae019c4999ef0f), [`75cd72c`](https://github.com/yielded-dev/auth/commit/75cd72c41a3fecdd5c8e84cc76f2dd534b7f2e78), [`9392e50`](https://github.com/yielded-dev/auth/commit/9392e50f2b5ae7b275390fbbbd7a3100855441e4), [`bc112cc`](https://github.com/yielded-dev/auth/commit/bc112ccb9f063e374c40dc12d634efaba6812502), [`4973533`](https://github.com/yielded-dev/auth/commit/49735334149d3d29a34542047a27ff6fffac9f7e), [`4973533`](https://github.com/yielded-dev/auth/commit/49735334149d3d29a34542047a27ff6fffac9f7e), [`4dbe837`](https://github.com/yielded-dev/auth/commit/4dbe837e23399e1e659c3b6eb7d2a041b5653de0), [`156f0b3`](https://github.com/yielded-dev/auth/commit/156f0b3b01a60bb21f9984d6d464d05f73b79283)]:
  - @yielded/auth@0.1.0-beta.11
  - @yielded/auth-persistence@0.1.0-beta.11
  - @yielded/auth-crypto@0.1.0-beta.1

## 0.1.0-beta.0

### Minor Changes

- [#38](https://github.com/yielded-dev/auth/pull/38) [`a0e201b`](https://github.com/yielded-dev/auth/commit/a0e201be286400fc8ae310cfe5e60b5cd2c0077e) Thanks [@danieljvdm](https://github.com/danieljvdm)! - Move Drizzle persistence and migration helpers into `@yielded/auth-persistence-drizzle`, leaving the default SQL package free of Drizzle dependencies and declarations.

  BEHAVIOR CHANGE: Import mappings from the companion root and drivers from explicit modules such as `@yielded/auth-persistence-drizzle/SqliteBun` instead of `@yielded/auth-persistence/drizzle/*`.

### Patch Changes

- Updated dependencies [[`1253846`](https://github.com/yielded-dev/auth/commit/12538461669ff3921f9a582b2ec4905f499db726), [`39bfccb`](https://github.com/yielded-dev/auth/commit/39bfccb93d9a14108b0973694e799f70f26a40fe), [`a0e201b`](https://github.com/yielded-dev/auth/commit/a0e201be286400fc8ae310cfe5e60b5cd2c0077e)]:
  - @yielded/auth@0.1.0-beta.10
  - @yielded/auth-persistence@0.1.0-beta.10
  - @yielded/auth-crypto@0.1.0-beta.0
