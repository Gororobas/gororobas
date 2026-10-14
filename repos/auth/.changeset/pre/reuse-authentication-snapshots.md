---
"@yielded/auth": patch
"@yielded/auth-persistence": patch
"@yielded/auth-persistence-drizzle": patch
---

Reuse authoritative session and factor snapshots within a request, preserve fresh step-up assurance without extending absolute expiry, and keep existing sessions when regenerating recovery codes. BEHAVIOR CHANGE: reset development session and pending state, map current subject policy and shared pending kinds, implement bounded browser-login cleanup, and replace removed strategy verification, preparation, row-version and flow-deduplication contracts.
