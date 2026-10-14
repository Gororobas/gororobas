---
"@yielded/auth": patch
"@yielded/crypto": patch
---

Provide `WorkerdPasswordlessServices.layer` for Workers authentication without Argon2 Wasm or Node.js compatibility. Reject OAuth protector construction when the supplied AEAD service lacks XChaCha20-Poly1305 support.

BEHAVIOR CHANGE: Implement `supports(algorithm)` on custom `Aead` services.
