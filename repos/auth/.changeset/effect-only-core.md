---
"@yielded/auth": minor
"@yielded/auth-persistence": patch
"@yielded/auth-crypto": minor
---

Move maintained cryptography into `@yielded/auth-crypto`, leaving Effect as core's only runtime peer and preserving stored credential and ciphertext formats. BEHAVIOR CHANGE: supply password hashing, TOTP cryptography, and OAuth protector Layers from the companion package; move `digest`/`randomId` and TOTP crypto helper imports there, and provide OAuthApp protectors instead of passing `transactionKeys`/`tokenKeys` options.
