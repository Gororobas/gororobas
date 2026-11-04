---
title: Cryptography
description: Supply Effect crypto services and bounded password-derivation backends.
---

Auth and JOSE use `effect/crypto` for secure randomness, digests, message
authentication, authenticated encryption, signatures, and key formats. Applications
own keys, nonce uniqueness, accepted algorithms, and credential policy.
Password hashing uses Effect Kdf. Auth owns password cost limits, shared admission,
and a separate scrypt adapter. `@yielded/auth-platform-workerd` owns the Workers
runtime layers and WASM Argon2id implementation.

## Compose a backend

`WebCrypto.layer` provides secure randomness, digests, HMAC, authenticated encryption,
and signatures through Effect:

```ts
import { WebCrypto } from "@yielded/auth";
import { Effect } from "effect";
import { Aead, SecureRandom } from "effect/crypto";

// Read a cryptographically random application key from secret configuration.
declare const keyBytes: Uint8Array;

const protect = Effect.gen(function* () {
  const random = yield* SecureRandom.SecureRandom;
  const aead = yield* Aead.Aead;
  const key = yield* Aead.key(Aead.aes256Gcm, keyBytes);
  const nonce = yield* random.randomBytes(12);
  const ciphertext = yield* aead.encrypt(
    key,
    new TextEncoder().encode("private data"),
    { nonce, aad: new TextEncoder().encode("application/purpose/v1") },
  );
  return { nonce, ciphertext };
}).pipe(Effect.provide(WebCrypto.layer));
```

Never reuse a nonce with the same key.
The preset is also available directly from `@yielded/auth/WebCrypto`. Use
`NodeCrypto.layer` from `@effect/platform-node` or `BunCrypto.layer` from
`@effect/platform-bun` for native crypto, including Argon2id.
Consumers needing a single capability can supply its `effect/crypto` Layer directly.
HTTP is separate: provide `FetchHttpClient.layer` or your configured client when needed.

Effect keys are opaque snapshots. `Mac.key` and `Aead.key` import raw bytes;
`KeyFormat` imports and exports asymmetric keys as JWK, PKCS8, or SPKI.
Keep private material out of telemetry. Effect crypto errors can carry native
causes: translate them at your application's public boundary.

## Use with Auth

Choose the services your application needs:

| Auth concern                       | Effect services                                               |
| ---------------------------------- | ------------------------------------------------------------- |
| Stateful sessions and token proofs | `SecureRandom`, `Digest`                                      |
| Signed sessions and numeric proofs | `SecureRandom`, `Digest`, `Mac`                               |
| TOTP                               | `SecureRandom`, `Digest`, `Mac`, `Aead`                       |
| OAuth protection                   | `SecureRandom`, `Aead`                                        |
| OIDC verification                  | `Signature`, plus the provider's HTTP and digest requirements |

Auth owns keyring validation, key IDs, token serialization, and authenticated
context. Its OAuth protectors use XChaCha20-Poly1305; TOTP uses AES-256-GCM.
Effect's WebCrypto AEAD Layer supplies both. Existing application configuration
continues to use redacted key bytes or base64url keyring material.

On Cloudflare Workers, `WorkerdServices.layer` from `@yielded/auth-platform-workerd`
combines `WebCrypto.layer` with password hashing, Wasm Argon2id, native scrypt,
and bounded admission. Enable `nodejs_compat` and bundle with Wrangler. Supply
HTTP separately, as in the [Workers example](https://github.com/yielded-dev/auth/blob/main/examples/auth/src/workerd-services.ts).
`WebCrypto.layer` alone needs neither Wasm nor Node.js compatibility.

Provide the selected Layer to the application once. Storage, account policy,
keys, delivery, and protocol adapters remain application-owned. Direct callers of
`Sessions.makeSessionSigningCodec` and numeric `Proofs.makeProofCrypto` must keep
the construction Scope open while using their operations. Auth Layers own that
scope when constructing them.

For manual password composition on Node:

```ts
import { NodeCrypto } from "@effect/platform-node";
import { Password } from "@yielded/auth";
import * as PasswordScrypt from "@yielded/auth/PasswordScrypt";
import { Layer } from "effect";

export const CryptoLive = Layer.mergeAll(
  NodeCrypto.layer,
  PasswordScrypt.layer,
  Password.KdfAdmission.layer(),
);

export const PasswordLive = Password.PasswordHashing.layer().pipe(
  Layer.provide(CryptoLive),
);
```

Use `BunCrypto.layer` on Bun. Native Argon2id requires runtime support; other hosts
can supply their own Effect Kdf implementation.
Scrypt is optional: without `PasswordScrypt.layer`, attempts to derive or verify
scrypt fail with `PasswordHashingUnavailable`. Other password formats still work.

## Password resource limits

`PasswordHashingConfig` owns password strength, verification cost ceilings, input
length, and rehash policy. Limits apply before derivation, including for stored
verifiers. Argon2id uses version 19 and memory in KiB. Scrypt uses `cost` (N),
`blockSize` (r), and `parallelism` (p); memory includes scratch buffers, and
`N*r*p/8` must fit `maximumMemoryPasses`. Legacy PBKDF2 uses SHA-256.
An unavailable algorithm fails without downgrading. Passwords are not normalized
by the hasher.

Share one `Password.KdfAdmission.layer()` across password hashers in each runtime.
Its `concurrency`, `maxQueued`, and `maxWaitMilliseconds` options default to one
running operation, sixteen queued operations, and five seconds to acquire capacity.
The permit covers preparation, derivation, and cleanup. Waiting is interruptible;
noncancelable native work retains its permit until completion. Portable Argon2id
yields between batches on the calling thread.

Retain the built Layer for the application's lifetime to share these limits.
They do not coordinate isolates or replace a distributed rate limiter.
`WorkerdServices.layerWith` accepts `passwordHashing` and `kdfAdmission` options.
Calling Effect Kdf directly bypasses Auth's password policy and admission.

Password failures expose fixed classifications without native causes. Owned
password and output buffers are cleared after work; JavaScript and native engines
cannot guarantee erasure of every copy.

See the [password guide](../guide/passwords.md) and the
[shipped notices](https://github.com/yielded-dev/auth/blob/main/packages/auth-platform-workerd/THIRD_PARTY_NOTICES.md)
for the retained Argon2 implementation's attribution.
