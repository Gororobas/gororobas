---
"@yielded/auth": patch
"@yielded/jose": patch
---

Reuse local public-key resolvers for OAuth client assertions within each configured key generation. Expose `Jwks.makeLocal` to retain a validated local resolver without building a Layer.
