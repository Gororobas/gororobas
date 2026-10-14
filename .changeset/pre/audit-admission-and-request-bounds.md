---
"@yielded/auth": patch
"@yielded/auth-persistence": patch
"@yielded/auth-persistence-drizzle": patch
---

Release password admission after attempt retention, page phone admission cleanup, and resolve an OAuth reservation when the provider issues no token.

Keep request resources and post-commit hooks on the caller, report password outages as unavailable, and reuse each issuer's JWKS cache.

BEHAVIOR CHANGE: Clear unresolved reservations left by earlier definite provider rejections if a cohort stays blocked. Password attempts need no reset.
