---
"@yielded/auth": patch
"@yielded/auth-persistence": patch
"@yielded/auth-persistence-drizzle": patch
---

Remove durable password attempts and fresh password sign-in flow writes while retaining commit-time authority checks. BEHAVIOR CHANGE: replace custom password admission/settlement/cleanup with `findCredential` and `rehashIfCurrent`, remove attempt mappings and `attemptLifetimeMillis`, return `{ revision, requirement }` from `AuthenticationAuthority.capture`, and honor fresh session issuance in custom stores; obsolete password attempt tables can be dropped without resetting credentials or sessions.
