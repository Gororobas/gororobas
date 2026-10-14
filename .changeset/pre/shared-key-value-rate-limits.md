---
"@yielded/auth": minor
---

Add `keyValueRateLimiterStore` to `@yielded/auth/Persistence`, which keeps auth rate limits in any Effect `KeyValueStore`, such as Workers KV. BEHAVIOR CHANGE: action, global message, and passkey module budgets now always stay per instance; a supplied store holds only identifier, subject, target, and network buckets.
