# @yielded/crypto

Effect services for authenticated encryption, HMAC, key derivation and signatures.
Effect is its only runtime package dependency; it is independent of Auth.
Applications own keys, nonces, password
policy, envelopes and protocol formats. Use Effect `Crypto` for secure randomness
and SHA digests.

```sh
bun add @yielded/crypto@beta effect
```

Import `Aead`, `Hmac`, `Kdf`, `KdfAdmission` and `Signature` from the root. Select
an implementation through a direct backend import:

- `/WebCrypto`: native operations from a supplied `SubtleCrypto`, plus named global
  web adapters for Effect entropy/digests and HMAC.
- `/Portable`: WebCrypto plus owned Argon2id and XChaCha20-Poly1305 implementations.
- `/platform-node`, `/platform-bun`: shared Node-compatible WebCrypto and native
  Argon2id and scrypt, plus the owned XChaCha20-Poly1305 implementation.
- `/platform-workerd`: supplied WebCrypto, Wasm Argon2id, native scrypt and owned
  XChaCha20-Poly1305. Wrangler bundles the included Wasm module; consumers need
  no compiler. This backend requires Workers Node.js compatibility.

Full backend Layers require one shared `KdfAdmission` Layer to bound derivation
concurrency and waiting. Interruption waits for admitted native work to finish;
portable Argon2id yields cooperatively but runs on the calling thread. The focused
`WebCrypto.layerHmac(subtle)` and global `layerWebCrypto` adapters need no KDF admission.
`Portable.layerWithoutKdf(subtle)` supplies AEAD, HMAC and signatures without
KDFs or admission; `platform-workerd.layerKdf(subtle, limits?)` supplies only KDFs.

Secret inputs, derived bytes and decrypted plaintext use `Redacted`. Backend
errors contain classifications without native causes or secret payloads. Keep
each AEAD nonce unique for its key. HMAC, AES-GCM and signature services offer
scoped imports for repeated key use. Handles snapshot nonextractable native keys;
closure joins native work and prevents further use. Signature operations use PKCS8/SPKI DER keys;
raw key components can be encoded through the native key parser.
`decodePrivateKey` imports extractable PKCS8 and returns those components.
[JOSE](../jose/README.md) and password-hash serialization belong to other layers.

See the [usage and supported profiles](../../docs/src/content/docs/reference/crypto.md)
and [third-party notices](THIRD_PARTY_NOTICES.md). The notices ship in this package.
