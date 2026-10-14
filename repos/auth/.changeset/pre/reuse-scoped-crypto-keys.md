---
"@yielded/crypto": minor
---

Reduce portable Argon2id and HMAC scheduling overhead and XChaCha buffer allocation. Reuse AES-GCM and signature keys through scoped imports.

BEHAVIOR CHANGE: Custom `Aead` services must implement `importKey`; custom `Signature` services must implement `importPrivateKey` and `importPublicKey` with scoped key ownership.
