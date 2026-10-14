---
"@yielded/auth": patch
"@yielded/auth-persistence": patch
---

Require Effect 4.0.0-rc.117, matching SQL drivers, and effect-cf 0.49.0 for Cloudflare integrations. Accept safe PostgreSQL `bigint` values in raw SQL mappings, release nested MySQL savepoints, and reject standalone persistence operations inside ambient libSQL transactions.
