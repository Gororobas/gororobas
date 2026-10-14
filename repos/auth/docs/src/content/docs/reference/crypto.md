---
title: Reusable cryptography
description: Compose independent Effect crypto services with explicit runtime backends.
---

`@yielded/crypto` provides byte operations independently of Auth, with Effect as its
only runtime package dependency. Its services own
cryptographic execution; your application owns keys, nonce uniqueness, password
policy, trusted algorithms and envelope formats. Use Effect `Crypto` for entropy
and SHA digests. Auth directly supplies the domain services for
[passwords](../guide/passwords.md), [TOTP](../guide/totp.mdx) and
[OAuth](../guide/oauth.mdx).

## Compose a backend

```sh
bun add @yielded/crypto@beta effect @effect/platform-node
```

Import services from the root and backends from their direct modules. Share one
admission Layer across backend instances so they share the same resource budget.

```ts
import { NodeCrypto as PlatformCrypto } from "@effect/platform-node";
import { Aead, KdfAdmission } from "@yielded/crypto";
import * as NodeCrypto from "@yielded/crypto/platform-node";
import { Crypto, Effect, Layer, Redacted } from "effect";

const Admission = KdfAdmission.layer({ concurrency: 1, maxQueued: 16 });
const Cryptography = Layer.merge(
  PlatformCrypto.layer,
  NodeCrypto.layer().pipe(Layer.provide(Admission)),
);

// Load this application-owned 32-byte key from your secret configuration.
declare const key: Redacted.Redacted<Uint8Array>;

const protect = Effect.gen(function* () {
  const random = yield* Crypto.Crypto;
  const aead = yield* Aead.Aead;
  const nonce = yield* random.randomBytes(12);
  const ciphertext = yield* aead.encrypt({
    algorithm: "AES-256-GCM",
    key,
    nonce,
    plaintext: Redacted.make(new TextEncoder().encode("private data")),
    additionalData: new TextEncoder().encode("application/purpose/v1"),
  });

  return { nonce, ciphertext };
}).pipe(Effect.provide(Cryptography));
```

For a supplied WebCrypto capability, use
`WebCrypto.layer(globalThis.crypto.subtle)` from `@yielded/crypto/WebCrypto`.
Choose `Portable.layer(globalThis.crypto.subtle)` from `@yielded/crypto/Portable`
when you also need portable Argon2id and XChaCha20-Poly1305. Each accepts an optional
second argument containing KDF limit overrides; `NodeCrypto.layer(limits?)`
takes those overrides as its first argument. Bun uses the same implementation
through `@yielded/crypto/platform-bun`.

`Portable.layerWithoutKdf(subtle)` supplies AEAD, HMAC and signatures, including
XChaCha20-Poly1305, without KDF services or admission.

For Workers with Wasm Argon2id and native scrypt, use `WorkerdCrypto.layer(globalThis.crypto.subtle)` from
`@yielded/crypto/platform-workerd`. It uses a bundled Wasm module for Argon2id
and native `node:crypto.scrypt`. Wrangler includes the Wasm module in the Worker
deployment; consumers need no compiler or runtime download. This backend
requires Node.js compatibility. All Argon2id backends use the same parameters
and stored-hash format.
Use `WorkerdCrypto.layerKdf(subtle, limits?)` when other crypto services are already supplied.

PBKDF2 uses the supplied WebCrypto and remains subject to the host's iteration
limit, which can be lower than the library's configured ceiling. Stored PBKDF2
credentials require a host that accepts their iteration counts.

For sessions and proofs, `WebCrypto.layerWebCrypto` supplies Effect `Crypto` and
`Hmac` from the runtime's global WebCrypto. Its components are `layerCryptoWeb`
(entropy and SHA digests) and `layerHmacWeb`. To supply HMAC from an explicit host
capability, use `layerHmac(subtle)`. These focused Layers need no `KdfAdmission`.

## Use with Auth

For Cloudflare Workers, select the services your application needs:

| Direct import                               | Services                                                                         |
| ------------------------------------------- | -------------------------------------------------------------------------------- |
| `@yielded/auth/WorkerdPasswordlessServices` | Entropy/digests, XChaCha-capable AEAD, HMAC, signatures and a Fetch `HttpClient` |
| `@yielded/auth/WorkerdServices`             | All of the above, plus KDFs, bounded admission and password hashing              |

Provide the selected `layer` once at your application's composition root:

```ts title="apps/server/live.ts"
import * as WorkerdServices from "@yielded/auth/WorkerdPasswordlessServices";
import { Layer } from "effect";

import { ApplicationLive } from "./application";

export const MainLive = ApplicationLive.pipe(Layer.provide(WorkerdServices.layer));
```

`WorkerdPasswordlessServices` supports OAuth, sessions, passkeys, codes and TOTP
without importing Wasm or requiring Node.js compatibility. Storage, account policy,
keys, delivery and protocol adapters remain application-owned. Import either
Workers module directly; the package root does not export them.

OAuth protector Layers check for XChaCha20-Poly1305 support and fail with
`OAuthConfigurationError` (`reason: "crypto"`) when it is absent. Both Workers
Layers provide it; `WebCrypto.layer` alone does not.

For password hashing, change the import to `@yielded/auth/WorkerdServices` and
enable `"compatibility_flags": ["nodejs_compat"]` in your Wrangler configuration.
Password hashing defaults to Argon2id and shares bounded KDF admission with the
backend. Wrangler bundles its Argon2id Wasm module.
The [Workers example](https://github.com/yielded-dev/auth/blob/main/examples/auth/src/workerd-services.ts)
shows this password-capable route composition.

Use `WorkerdServices.layerWith({ passwordHashing, kdfLimits, kdfAdmission })` to
override password policy and resource bounds. `passwordHashing` accepts
`Password.PasswordHashingConfig`, including `Password.defaultScryptPasswordHashingConfig`.
`kdfLimits` accepts the backend's per-derivation ceilings; `kdfAdmission` accepts
the [concurrency and queue options](#backends-and-resource-limits).

Admission is shared for the built services' lifetime. To bound concurrent requests
within a Worker isolate, build and retain these services at that lifetime and
supply them to [request-scoped auth/database Layers](./adapters#workers-and-request-scoped-sql).
Rebuilding the Layer for every request creates independent admission services.
This does not coordinate limits between isolates or replace sign-in rate limiting.

For other runtimes or custom composition, select the backend explicitly. This
portable setup supplies Effect entropy/digests and KDF, AEAD, HMAC, and signature services:

```ts title="apps/server/crypto-live.ts"
import * as KdfAdmission from "@yielded/crypto/KdfAdmission";
import * as Portable from "@yielded/crypto/Portable";
import * as WebCrypto from "@yielded/crypto/WebCrypto";
import { Layer } from "effect";

const Admission = KdfAdmission.layer();
export const CryptoLive = Layer.merge(
  WebCrypto.layerCryptoWeb,
  Portable.layer(globalThis.crypto.subtle).pipe(Layer.provideMerge(Admission)),
);
```

With manual composition, provide `CryptoLive` to your Auth Layer and to `Password.PasswordHashing.layer()`,
`Totp.TotpCryptography.layer`, and the `OAuth` protector Layers. TOTP also requires
`TotpSecretKeys`; OAuth protectors take their application keyring as an argument.
`OpenIdConnect` and `GitHub` provider Layers additionally require `HttpClient`.
Build provider and protector Layers in the application's owning scope.

Sessions and numeric proofs use `Hmac` for their imported keys. Auth owns keyring
validation, key IDs, and credential formats; crypto owns native key handling.
Auth requires explicitly selected runtime services and does not detect a backend.
Stateful sessions require Effect `Crypto`; signed sessions and numeric proofs also require `Hmac`.
`@yielded/auth/WebCrypto` also exports `layerCryptoWeb` and `layerWebCrypto`.
Direct callers of
`Sessions.makeSessionSigningCodec` and numeric `Proofs.makeProofCrypto` must keep
their construction Scope open while using the returned operations; Auth Layers
own this scope automatically. Token-only proof construction needs Effect
`Crypto` without `Hmac` or `Scope`.

Use the same `KdfAdmission` Layer instance for the backend and password operations
so their nested work shares a permit. Auth preserves its
password limits, PHC/PBKDF2 encodings, TOTP recovery digests, and OAuth envelopes;
changing the backend does not change stored credential bytes or keyring policy.

## Supported profiles

- **`Aead.Aead`**: Profile: `AES-256-GCM`. Bytes and key formats: 32-byte key, 12-byte nonce, 16-byte appended authentication tag.
- **`Aead.Aead`**: Profile: `XChaCha20-Poly1305`. Bytes and key formats: 32-byte key, 24-byte nonce, 16-byte appended authentication tag.
- **`Hmac.Hmac`**: Profile: `SHA-1`, `SHA-256`, `SHA-384`, `SHA-512`. Bytes and key formats: Nonempty secret key; complete MAC, without truncation.
- **`Kdf.Kdf`**: Profile: `pbkdf2`, `hkdf`. Bytes and key formats: SHA-256; lengths are bytes.
- **`Kdf.Kdf`**: Profile: `argon2id`. Bytes and key formats: Version 19; memory in KiB; optional secret and associated data.
- **`Kdf.Kdf`**: Profile: `scrypt`. Parameters: `cost` (N), `blockSize` (r), `parallelism` (p); output length in bytes.
- **`Signature.Signature`**: Profile: `ECDSA-P256-SHA256`. Bytes and key formats: 64-byte IEEE P1363 signature (`r || s`).
- **`Signature.Signature`**: Profile: `RSASSA-PKCS1-v1_5-SHA256`, `RSA-PSS-SHA256`. Bytes and key formats: RSA keys of at least 2048 bits; PSS uses SHA-256, MGF1-SHA-256 and a 32-byte salt.
- **`Signature.Signature`**: Profile: `Ed25519`. Bytes and key formats: Pure Ed25519, 64-byte signature.

Signature signing takes a `Redacted` PKCS8 DER private key; verification takes an
SPKI DER public key. `encodePublicKey` and `encodePrivateKey` convert raw
unsigned key components through the platform’s key parser; private components
and the resulting PKCS8 use `Redacted`. Keys are limited to 16 KiB of DER.
`generateKeyPair({ algorithm })` returns typed public components and redacted
private components. RSA defaults to 2048 bits with exponent 65537; `modulusLength`
also accepts 3072 or 4096. The caller owns the exported secret bytes. Native
generation is joined before interruption completes. Custom `Signature` services
implement generation, `decodePrivateKey`, encoding, signing and verification.
`decodePrivateKey` imports extractable PKCS8 and returns typed components.
[JOSE](./jose.mdx) owns JWK metadata and JWTs. PHC password hashes, PEM text and
Auth envelopes are outside this package. SHA-1 HMAC is available
for existing protocols such as TOTP.

Raw-key operations import keys on each call. For repeated use, import a key once
in the Scope that owns the work:

- **`Hmac`**: Import: `importKey({ algorithm, key })`. Returned operations: `sign(data)`, `verify(data, tag)`.
- **`Aead`**: Import: `importKey({ algorithm: "AES-256-GCM", key })`. Returned operations: `encrypt({ nonce, plaintext, additionalData? })`, `decrypt({ nonce, ciphertext, additionalData? })`.
- **`Signature`**: Import: `importPrivateKey({ algorithm, privateKey })`. Returned operations: `sign(data)`.
- **`Signature`**: Import: `importPublicKey({ algorithm, publicKey })`. Returned operations: `verify(data, signature)`.

Imports validate and snapshot nonextractable native keys. Algorithm and usage
stay fixed on each handle; AES still requires a unique nonce per encryption.
The caller retains ownership of the original bytes and can change them after
import completes. Keep the import's Scope open while using its handle: closing
it waits for native calls and makes later operations fail with `CryptoUnavailable`.
Custom service implementations must support these scoped imports as well as
raw-key operations. XChaCha continues to use raw-key operations.

## Backends and resource limits

- **`WebCrypto`**: Native operations: AES-GCM, HMAC, PBKDF2, HKDF, signatures. Portable operations: None. Unsupported operations: Argon2id, scrypt, XChaCha.
- **`Portable`**: Native operations: AES-GCM, HMAC, PBKDF2, HKDF, signatures. Portable operations: Owned Argon2id and XChaCha. Unsupported operations: scrypt; host-specific native capability gaps.
- **`platform-node`, `platform-bun`**: Native operations: Node-compatible WebCrypto, Argon2id and scrypt. Portable operations: Owned XChaCha. Unsupported operations: Native Argon2id when the host lacks `crypto.argon2`.
- **`platform-workerd`**: Native operations: WebCrypto and scrypt. Portable operations: Wasm Argon2id and owned XChaCha. Unsupported operations: Host-specific native capability gaps.

Backend selection is explicit. An unavailable native algorithm fails with
`CryptoUnsupportedAlgorithm`; it does not silently select a different algorithm
or password cost. Check that your runtime supplies the native algorithms you select.
`Aead.supports(algorithm)` reports whether the selected backend implements that
algorithm; host operations can still fail. Custom `Aead` services must implement it.

`Kdf.defaultLimits` defines per-derivation resource ceilings. Backend construction
validates overrides before exposing services. These are work limits, not a
password-strength policy. Raising them does not widen the algorithm's numeric
domain. The HKDF profile limits `info` to 1024 bytes and output to 8160 bytes;
PBKDF2 iterations must fit a positive signed 32-bit integer. KDF inputs are bytes:
the library neither decodes nor normalizes passwords. Auth owns password
validation, PHC parsing and rehash policy.

Scrypt requires a power-of-two `cost` greater than one and below `2^(16*r)`.
Its allocation must fit
`maximumMemoryKiB`, including native scratch buffers; `N*r*p/8` must fit
`maximumMemoryPasses`. `maximumParallelism` and `maximumPasses` apply to Argon2id.
Custom `Kdf` services implement `scrypt` alongside the existing methods, returning
`CryptoUnsupportedAlgorithm` when unavailable.

`KdfAdmission.layer()` defaults to one running derivation, sixteen queued requests
and a five-second acquisition wait. Waiting can be interrupted. Once native work
starts, interruption waits for the work and cleanup to finish before releasing
capacity. Portable and Worker Argon2id yield and accept interruption between time slices,
but remain on the calling thread. `KdfAdmission.run` preserves interruptibility;
custom backends must protect any nonabortable native work until it finishes.
Nested `run` calls reuse admission only in the same fiber and on the same service
instance. A child fiber acquires independently.

## Failure and secret boundaries

HMAC and signature verification return `false` for mismatches. Authenticated
decryption returns `CryptoAuthenticationFailed` without releasing plaintext.
Malformed keys, nonces and parameters return `CryptoInvalidInput`; backend failures
return `CryptoUnavailable`; admission overload or wait expiry returns
`CryptoKdfBusy`. These errors retain no native diagnostic cause.

Keys, passwords, decrypted plaintext and derived material use `Redacted`.
Secret-bearing input schemas reject JSON encoding. Owned secret copies are cleared
after work, without mutating caller buffers; JavaScript and native engines do not
provide a guarantee that all secret copies are erased. Scope any retained secrets
and use dedicated keys for each application purpose.

The [shipped third-party notices](https://github.com/yielded-dev/auth/blob/main/packages/crypto/THIRD_PARTY_NOTICES.md)
credit selected Noble, Wycheproof and standards sources.
