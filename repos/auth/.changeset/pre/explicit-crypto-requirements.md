---
"@yielded/auth": patch
"@yielded/auth-persistence": patch
"@yielded/auth-persistence-drizzle": patch
"@yielded/jose": patch
"@yielded/oauth": patch
---

Require application-supplied crypto Layers throughout Auth and acquire storage-mapping dependencies through Effect requirements. Remove the unused Hmac requirement from JWKS and OIDC verification.

BEHAVIOR CHANGE: Replace `Persistence.cryptoLayer` with your selected backend and provide it to the Auth Layer. Yield `Adapter.makeStorageMappings(storage)` inside an Effect with `Crypto` supplied.
