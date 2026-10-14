---
"@yielded/crypto": minor
"@yielded/auth": minor
---

Accelerate Argon2id on Workers with bundled Wasm and add native scrypt on Node, Bun, and Workers. Select `defaultScryptPasswordHashingConfig` to migrate passwords to scrypt on successful sign-in; **BEHAVIOR CHANGE:** custom `Kdf` services must provide `scrypt`.
