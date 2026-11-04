# @yielded/auth-simplewebauthn

## 0.1.0-beta.47

### Patch Changes

- [#288](https://github.com/yielded-dev/auth/pull/288) [`109c420`](https://github.com/yielded-dev/auth/commit/109c4201e63637c8e9c23039c5a248b872fddca0) Thanks [@danieljvdm](https://github.com/danieljvdm)! - Use Effect crypto and one `WebCrypto.layer` preset, and move Workers password hashing to `@yielded/auth-platform-workerd`. BEHAVIOR CHANGE: require Effect 4.1 and matching SQL drivers; replace `@yielded/crypto` and Auth's Workers subpaths with Effect crypto Layers or the Workers package, supply HTTP and the Kdf for `Testing.services()` separately, and use `Password.KdfAdmission.layer()`, optional `PasswordScrypt.layer`, and opaque Effect keys for JOSE.
- Updated dependencies [[`197ddba`](https://github.com/yielded-dev/auth/commit/197ddba9395e4622c0d4dd0b8cb769b8d6364a78), [`1dd5bbe`](https://github.com/yielded-dev/auth/commit/1dd5bbe219733a0f09614c2e3b2520f62bdb421f), [`b0b5df2`](https://github.com/yielded-dev/auth/commit/b0b5df2d405bcbc70a04b4391763f16aed10f9e1), [`109c420`](https://github.com/yielded-dev/auth/commit/109c4201e63637c8e9c23039c5a248b872fddca0)]:
  - @yielded/auth@0.1.0-beta.47

## 0.1.0-beta.46

### Patch Changes

- Updated dependencies [[`c38c0f0`](https://github.com/yielded-dev/auth/commit/c38c0f0a3298f53938d18289d12e9d510ef6b525), [`6d219e8`](https://github.com/yielded-dev/auth/commit/6d219e89989e72793ba627e37b3a349745cd9f72)]:
  - @yielded/auth@0.1.0-beta.46

## 0.1.0-beta.45

### Patch Changes

- Updated dependencies [[`267b2f4`](https://github.com/yielded-dev/auth/commit/267b2f4118de57829f98421e64e210a5df927db3), [`3f063b5`](https://github.com/yielded-dev/auth/commit/3f063b51533c64b118ee3325efd7795c26e66ddc), [`12c4b81`](https://github.com/yielded-dev/auth/commit/12c4b812aa09f2898573da0d41fae8af886055b8)]:
  - @yielded/auth@0.1.0-beta.45

## 0.1.0-beta.44

### Patch Changes

- Updated dependencies [[`11e04fb`](https://github.com/yielded-dev/auth/commit/11e04fb14edbc0d409b88540cd1538fbddf2ab74), [`81d27d1`](https://github.com/yielded-dev/auth/commit/81d27d14918acdd48ac2e51c5f34a6af246ea983)]:
  - @yielded/auth@0.1.0-beta.44

## 0.1.0-beta.43

### Patch Changes

- Updated dependencies [[`d29041b`](https://github.com/yielded-dev/auth/commit/d29041b595fe2c04a6c23dc974e3a40b49f8b307)]:
  - @yielded/auth@0.1.0-beta.43

## 0.1.0-beta.42

### Patch Changes

- [#243](https://github.com/yielded-dev/auth/pull/243) [`0a0ff7d`](https://github.com/yielded-dev/auth/commit/0a0ff7d6d81d8b9e0aacd39ec81991b1f259e956) Thanks [@danieljvdm](https://github.com/danieljvdm)! - Preserve complete failure causes across authentication, persistence, provider, and native client boundaries, and report unexpected background and cleanup failures without exposing private data.
- Updated dependencies [[`0a0ff7d`](https://github.com/yielded-dev/auth/commit/0a0ff7d6d81d8b9e0aacd39ec81991b1f259e956)]:
  - @yielded/auth@0.1.0-beta.42

## 0.1.0-beta.41

### Patch Changes

- Updated dependencies [[`ba7ccf2`](https://github.com/yielded-dev/auth/commit/ba7ccf23307cea88dcc20ee4b13f21561996a62c)]:
  - @yielded/auth@0.1.0-beta.41

## 0.1.0-beta.40

### Patch Changes

- Updated dependencies [[`4ea887e`](https://github.com/yielded-dev/auth/commit/4ea887e2f77cd6e13defe1d445b892b45216b3ef)]:
  - @yielded/auth@0.1.0-beta.40

## 0.1.0-beta.39

### Patch Changes

- Updated dependencies []:
  - @yielded/auth@0.1.0-beta.39

## 0.1.0-beta.38

### Patch Changes

- Updated dependencies [[`2186f4f`](https://github.com/yielded-dev/auth/commit/2186f4f649c72d3d37be7fcf25e10f097a4fcb04)]:
  - @yielded/auth@0.1.0-beta.38

## 0.1.0-beta.37

### Patch Changes

- Updated dependencies [[`a37f2c9`](https://github.com/yielded-dev/auth/commit/a37f2c956afd791294329108e6d22b764958061f)]:
  - @yielded/auth@0.1.0-beta.37

## 0.1.0-beta.36

### Patch Changes

- Updated dependencies []:
  - @yielded/auth@0.1.0-beta.36

## 0.1.0-beta.35

### Patch Changes

- [#217](https://github.com/yielded-dev/auth/pull/217) [`7cb7cc4`](https://github.com/yielded-dev/auth/commit/7cb7cc4b56ff498d1985575544ef3b87dd9985ca) Thanks [@danieljvdm](https://github.com/danieljvdm)! - Avoid duplicate native public-key imports during passkey authentication while retaining credential validation.
- Updated dependencies [[`b97748f`](https://github.com/yielded-dev/auth/commit/b97748f6f655d836107184a5f982ea75abc0ea98), [`1f648ae`](https://github.com/yielded-dev/auth/commit/1f648ae827a81fd3d17da28d93548245a43e2538), [`172e9d1`](https://github.com/yielded-dev/auth/commit/172e9d1f975190e8015d7d583b83f5ef7e6d925b), [`5875575`](https://github.com/yielded-dev/auth/commit/5875575c9c62f6d755734f3874e13ca654c8d3bd), [`7f47bce`](https://github.com/yielded-dev/auth/commit/7f47bce67b8e0c7a49a6f2421cf09667a4b5f044), [`948a3f1`](https://github.com/yielded-dev/auth/commit/948a3f12295b59c0bc560941edbbef59cc0b77b9), [`9bc7083`](https://github.com/yielded-dev/auth/commit/9bc7083ced9992ed428c61f45163217b09857079), [`b86c41e`](https://github.com/yielded-dev/auth/commit/b86c41e562a9f623d2f3f7f6fa6d9a9835b5fbb8), [`e368c21`](https://github.com/yielded-dev/auth/commit/e368c21e51bea214efb41158aec4585c8db509a2), [`1a65155`](https://github.com/yielded-dev/auth/commit/1a65155dec67dd4cf6d114132759e93e758d01db), [`56cef27`](https://github.com/yielded-dev/auth/commit/56cef272b938592ea8e05409ce040f3ec4305c74), [`fbc58e3`](https://github.com/yielded-dev/auth/commit/fbc58e3343b140743e24c7a061bcf38985c45383), [`fd5d9e6`](https://github.com/yielded-dev/auth/commit/fd5d9e68803180acc9566317f4578a9f55b30f84)]:
  - @yielded/auth@0.1.0-beta.35

## 0.1.0-beta.34

### Patch Changes

- [#203](https://github.com/yielded-dev/auth/pull/203) [`5264de7`](https://github.com/yielded-dev/auth/commit/5264de78aee570c82718b2841ec38ea17544fa3e) Thanks [@danieljvdm](https://github.com/danieljvdm)! - Support Effect 4.0.3 across authentication workflows and companion packages. Require Effect 4.0.3 or later.
- Updated dependencies [[`5264de7`](https://github.com/yielded-dev/auth/commit/5264de78aee570c82718b2841ec38ea17544fa3e)]:
  - @yielded/auth@0.1.0-beta.34

## 0.1.0-beta.33

### Patch Changes

- Updated dependencies [[`b9b43e2`](https://github.com/yielded-dev/auth/commit/b9b43e24f6fedda4168cfb65b081c296ffd9233f), [`c9787f7`](https://github.com/yielded-dev/auth/commit/c9787f731dc64870f0ace15fa4e6edd3a3f13ff8), [`0ad3e4c`](https://github.com/yielded-dev/auth/commit/0ad3e4cc67a954e3a2f20aae9491e1608fd5ccea), [`2326161`](https://github.com/yielded-dev/auth/commit/232616128ad88418c375de9256614d37053c76e2), [`881f94d`](https://github.com/yielded-dev/auth/commit/881f94d31c9dfd3119bb2544925f9ee1d8b78368), [`0ee8f41`](https://github.com/yielded-dev/auth/commit/0ee8f415dc72d5ab750fb6813d783840c8ec65c5)]:
  - @yielded/auth@0.1.0-beta.33

## 0.1.0-beta.32

### Patch Changes

- Updated dependencies [[`32b9eb9`](https://github.com/yielded-dev/auth/commit/32b9eb9aad6945bc6065ca7c33857fd7d7627a32), [`93eab41`](https://github.com/yielded-dev/auth/commit/93eab4198349a9cfbfec73e66ca601701cd7c685), [`4c74ac6`](https://github.com/yielded-dev/auth/commit/4c74ac6325d14e4681c989acaa23760fe746728d), [`a33138f`](https://github.com/yielded-dev/auth/commit/a33138fd6fb853fd6763b3618bd93e3204f94dc2), [`dfdc622`](https://github.com/yielded-dev/auth/commit/dfdc622a346622474ca9a34f6215ee070cd718fc)]:
  - @yielded/auth@0.1.0-beta.32

## 0.1.0-beta.31

### Patch Changes

- Updated dependencies [[`759c6e7`](https://github.com/yielded-dev/auth/commit/759c6e73612d90a11d092f3c30cf8ddc3a1c0cdc), [`b5388b6`](https://github.com/yielded-dev/auth/commit/b5388b6e4bc0ebadf10e97367c09638ba17724e0), [`a1c5555`](https://github.com/yielded-dev/auth/commit/a1c555586cdf5415530ea71e08b25da3063772a3), [`dcf1691`](https://github.com/yielded-dev/auth/commit/dcf16913160299793e4ef460a41d390950661a7a)]:
  - @yielded/auth@0.1.0-beta.31

## 0.1.0-beta.30

### Patch Changes

- Updated dependencies [[`989f88c`](https://github.com/yielded-dev/auth/commit/989f88ca1a7f46ec73702330827c555b776d8206), [`8e5b5d1`](https://github.com/yielded-dev/auth/commit/8e5b5d173f82c98ad1fcd644b9d18d91c59d9a43)]:
  - @yielded/auth@0.1.0-beta.30

## 0.1.0-beta.29

### Patch Changes

- Updated dependencies [[`167f725`](https://github.com/yielded-dev/auth/commit/167f7256fa634430f442eb6f1e0a04595c605370)]:
  - @yielded/auth@0.1.0-beta.29

## 0.1.0-beta.28

### Patch Changes

- Updated dependencies [[`7a5b241`](https://github.com/yielded-dev/auth/commit/7a5b241f18f976271142e39fc523ba266ec4bbb0)]:
  - @yielded/auth@0.1.0-beta.28

## 0.1.0-beta.27

### Patch Changes

- Updated dependencies []:
  - @yielded/auth@0.1.0-beta.27

## 0.1.0-beta.26

### Minor Changes

- [#148](https://github.com/yielded-dev/auth/pull/148) [`dcdce5a`](https://github.com/yielded-dev/auth/commit/dcdce5a7c23647b58206974bdc4101b45d0df37f) Thanks [@danieljvdm](https://github.com/danieljvdm)! - Replace passkey claim leases with single-use challenge consumption, retain enrollment authorization from begin, allow in-progress ceremonies to finish with their selected RP profile during rolling deploys, and apply immediate-invalidation requirements only to removal.

  BEHAVIOR CHANGE: Remove enrollment completion action proofs, passkey generations, and mutation replay flags; replace `PasskeyCleanupResult` with `CleanupResult` from `@yielded/auth/Persistence`, reset development passkey tables and profile records, and supply a shared Effect limiter for coordinated limits across replicas.

### Patch Changes

- Updated dependencies [[`03b57e3`](https://github.com/yielded-dev/auth/commit/03b57e3186eb3bed3e4207ae7cf1a82f9ebbc349), [`03b57e3`](https://github.com/yielded-dev/auth/commit/03b57e3186eb3bed3e4207ae7cf1a82f9ebbc349), [`821d0a2`](https://github.com/yielded-dev/auth/commit/821d0a222aca754d1b3e2928dab0b6b9cd23b0d1), [`9b6ffb6`](https://github.com/yielded-dev/auth/commit/9b6ffb62679862890cbbb6604bdada5827c00400), [`dcdce5a`](https://github.com/yielded-dev/auth/commit/dcdce5a7c23647b58206974bdc4101b45d0df37f), [`dcdce5a`](https://github.com/yielded-dev/auth/commit/dcdce5a7c23647b58206974bdc4101b45d0df37f), [`730d296`](https://github.com/yielded-dev/auth/commit/730d296952af8473be2701eb33b404a8f02f9429), [`dcdce5a`](https://github.com/yielded-dev/auth/commit/dcdce5a7c23647b58206974bdc4101b45d0df37f)]:
  - @yielded/auth@0.1.0-beta.26

## 0.1.0-beta.25

### Patch Changes

- Updated dependencies [[`5d5f461`](https://github.com/yielded-dev/auth/commit/5d5f461a17587c1bde74d9ed667efe4bd85c888d)]:
  - @yielded/auth@0.1.0-beta.25

## 0.1.0-beta.24

### Patch Changes

- Updated dependencies [[`d980ff1`](https://github.com/yielded-dev/auth/commit/d980ff1e5f227fe3668052eb4f9852fd4e80ea73), [`009ae06`](https://github.com/yielded-dev/auth/commit/009ae060b1c5807e1948bcf399137f3081dd7388), [`33a3f3d`](https://github.com/yielded-dev/auth/commit/33a3f3d7c0a33c9b55bfc080ea5aad29c2d2f3f0), [`ade1bda`](https://github.com/yielded-dev/auth/commit/ade1bdaec762f291aad1fc5aac0e68684a940ddc), [`33a3f3d`](https://github.com/yielded-dev/auth/commit/33a3f3d7c0a33c9b55bfc080ea5aad29c2d2f3f0)]:
  - @yielded/auth@0.1.0-beta.24

## 0.1.0-beta.23

### Patch Changes

- Updated dependencies [[`2742351`](https://github.com/yielded-dev/auth/commit/27423515058032699f392712391321406cf2aa0e), [`aa8ba53`](https://github.com/yielded-dev/auth/commit/aa8ba53ff87b9905eb62e2663a4f888bbabfbb56), [`0fb0a5d`](https://github.com/yielded-dev/auth/commit/0fb0a5da1e395c579ac67d6fc9389dc5267cb0ea)]:
  - @yielded/auth@0.1.0-beta.23

## 0.1.0-beta.22

### Patch Changes

- Updated dependencies [[`1d4c0db`](https://github.com/yielded-dev/auth/commit/1d4c0db87517455eb1d7eef10e802b61650189dc)]:
  - @yielded/auth@0.1.0-beta.22

## 0.1.0-beta.21

### Patch Changes

- Updated dependencies [[`412c808`](https://github.com/yielded-dev/auth/commit/412c808796a1a52ee0dd568f9a88433d6a9ef2d4)]:
  - @yielded/auth@0.1.0-beta.21

## 0.1.0-beta.20

### Patch Changes

- Updated dependencies [[`3d6d331`](https://github.com/yielded-dev/auth/commit/3d6d331856712cbc4804cf0c495f01bb3124b38b)]:
  - @yielded/auth@0.1.0-beta.20

## 0.1.0-beta.19

### Patch Changes

- Updated dependencies [[`c4752e3`](https://github.com/yielded-dev/auth/commit/c4752e34b3b6f3a4f53270727fbdc3050d65935a), [`c4752e3`](https://github.com/yielded-dev/auth/commit/c4752e34b3b6f3a4f53270727fbdc3050d65935a), [`c4752e3`](https://github.com/yielded-dev/auth/commit/c4752e34b3b6f3a4f53270727fbdc3050d65935a)]:
  - @yielded/auth@0.1.0-beta.19

## 0.1.0-beta.18

### Patch Changes

- [#110](https://github.com/yielded-dev/auth/pull/110) [`b904442`](https://github.com/yielded-dev/auth/commit/b904442510ec0b5412e4be81933a4e1523e16260) Thanks [@goknsh](https://github.com/goknsh)! - Support TypeScript consumers with `exactOptionalPropertyTypes` enabled, including the default session lifecycle actions.

- Updated dependencies [[`9aaaa55`](https://github.com/yielded-dev/auth/commit/9aaaa55fff9e7bf7236036ba3fe8b84337eb3eae), [`b904442`](https://github.com/yielded-dev/auth/commit/b904442510ec0b5412e4be81933a4e1523e16260), [`a9009bf`](https://github.com/yielded-dev/auth/commit/a9009bf44c935946f7e8acde1a0073ef0239542a)]:
  - @yielded/auth@0.1.0-beta.18

## 0.1.0-beta.17

### Patch Changes

- Updated dependencies [[`2d6f361`](https://github.com/yielded-dev/auth/commit/2d6f361813bfa8523451120eddabcd801b83ab6d)]:
  - @yielded/auth@0.1.0-beta.17

## 0.1.0-beta.16

### Patch Changes

- Updated dependencies [[`a070c44`](https://github.com/yielded-dev/auth/commit/a070c44a4c86f79e2782119e74d7eae3ae064542)]:
  - @yielded/auth@0.1.0-beta.16

## 0.1.0-beta.15

### Patch Changes

- Updated dependencies [[`27126ab`](https://github.com/yielded-dev/auth/commit/27126ab493f71260416c623380ab3fcbe0ed8596), [`1650b34`](https://github.com/yielded-dev/auth/commit/1650b34275537a11fe629bc0fd7d749c023a05f0), [`d5e1f04`](https://github.com/yielded-dev/auth/commit/d5e1f0491732f30f10eea308667942be6aa51286), [`877f025`](https://github.com/yielded-dev/auth/commit/877f0256f2f3760b6f909f41f0985ac311149000), [`ac61865`](https://github.com/yielded-dev/auth/commit/ac61865b374c03e2046cbfb3e8fb6a824893fb4e), [`328b136`](https://github.com/yielded-dev/auth/commit/328b136ef2be59cc4763d861a26ae8af4e96b3cd), [`b5c46a1`](https://github.com/yielded-dev/auth/commit/b5c46a1e30a6f80c65a4a15f14354fc6c78e29eb), [`841d4c8`](https://github.com/yielded-dev/auth/commit/841d4c809e282ad10214a6abac570b1b45a263b1), [`e4c0408`](https://github.com/yielded-dev/auth/commit/e4c04089921f2363ae325c7dd8c0f50e0685c860), [`0140ee4`](https://github.com/yielded-dev/auth/commit/0140ee42ba96e49f7753bd8a9de3f8739576dd42), [`b2d82cb`](https://github.com/yielded-dev/auth/commit/b2d82cb59b2d19c2dad2dbc773ced8e6494955e4), [`5aa13b0`](https://github.com/yielded-dev/auth/commit/5aa13b0153d0be0613c3c51d7c442c719b1fe9bd), [`ddeeb6d`](https://github.com/yielded-dev/auth/commit/ddeeb6d47d12b029afa33742cf93aab6e1fe9dcf)]:
  - @yielded/auth@0.1.0-beta.15

## 0.1.0-beta.14

### Patch Changes

- Updated dependencies [[`b0ef3d8`](https://github.com/yielded-dev/auth/commit/b0ef3d8ffcb1cebca66db115a2f6fd5f3cc4d5ab)]:
  - @yielded/auth@0.1.0-beta.14

## 0.1.0-beta.13

### Patch Changes

- Updated dependencies [[`1c4df1c`](https://github.com/yielded-dev/auth/commit/1c4df1c52668d64b5e3d909cd03a025e88966e6a), [`1081d5b`](https://github.com/yielded-dev/auth/commit/1081d5b4003e9819e412c753273344ad00d47fc2)]:
  - @yielded/auth@0.1.0-beta.13

## 0.1.0-beta.12

### Patch Changes

- Align all public packages on a single beta version and release them together.

- Updated dependencies [[`67c8eff`](https://github.com/yielded-dev/auth/commit/67c8effd7b61ffb677e2a151d320ac308649fd12)]:
  - @yielded/auth@0.1.0-beta.12

## 0.1.0-beta.1

### Patch Changes

- [#52](https://github.com/yielded-dev/auth/pull/52) [`4dbe837`](https://github.com/yielded-dev/auth/commit/4dbe837e23399e1e659c3b6eb7d2a041b5653de0) Thanks [@danieljvdm](https://github.com/danieljvdm)! - Require stable Effect and matching SQL drivers, and update Cloudflare integration to effect-cf 0.53. Support Drizzle RC4 with the temporary Drizzle patch CLI when adding Drizzle to an existing Bun app.

- Updated dependencies [[`b9967b8`](https://github.com/yielded-dev/auth/commit/b9967b8326404a72fc5378c268ae019c4999ef0f), [`75cd72c`](https://github.com/yielded-dev/auth/commit/75cd72c41a3fecdd5c8e84cc76f2dd534b7f2e78), [`9392e50`](https://github.com/yielded-dev/auth/commit/9392e50f2b5ae7b275390fbbbd7a3100855441e4), [`bc112cc`](https://github.com/yielded-dev/auth/commit/bc112ccb9f063e374c40dc12d634efaba6812502), [`4973533`](https://github.com/yielded-dev/auth/commit/49735334149d3d29a34542047a27ff6fffac9f7e), [`4973533`](https://github.com/yielded-dev/auth/commit/49735334149d3d29a34542047a27ff6fffac9f7e), [`4dbe837`](https://github.com/yielded-dev/auth/commit/4dbe837e23399e1e659c3b6eb7d2a041b5653de0), [`156f0b3`](https://github.com/yielded-dev/auth/commit/156f0b3b01a60bb21f9984d6d464d05f73b79283)]:
  - @yielded/auth@0.1.0-beta.11

## 0.1.0-beta.0

### Minor Changes

- [#35](https://github.com/yielded-dev/auth/pull/35) [`39bfccb`](https://github.com/yielded-dev/auth/commit/39bfccb93d9a14108b0973694e799f70f26a40fe) Thanks [@danieljvdm](https://github.com/danieljvdm)! - Move SimpleWebAuthn, OpenID Client, GitHub, and Cloudflare integrations into companion packages, removing their SDK dependencies from core. BEHAVIOR CHANGE: import them from `@yielded/auth-simplewebauthn/Browser` or `/Server` (using `make` and `layer`), `@yielded/auth-openid-client` or its `/Connected` and `/GitHub` entries, and `@yielded/auth-cloudflare`.

### Patch Changes

- Updated dependencies [[`1253846`](https://github.com/yielded-dev/auth/commit/12538461669ff3921f9a582b2ec4905f499db726), [`39bfccb`](https://github.com/yielded-dev/auth/commit/39bfccb93d9a14108b0973694e799f70f26a40fe)]:
  - @yielded/auth@0.1.0-beta.10
