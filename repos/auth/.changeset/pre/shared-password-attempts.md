---
"@yielded/auth": patch
"@yielded/auth-persistence": patch
"@yielded/auth-persistence-drizzle": patch
---

Share password attempt persistence through native Effect SQL and use bounded process-local password rate limits with replaceable shared storage. BEHAVIOR CHANGE: supply a shared `RateLimiterStore` for multi-instance limits, replace custom `admitAttempt` implementations with `prepareAttempt`, and remove password rate-table mappings and the password `maximumPending` setting.
