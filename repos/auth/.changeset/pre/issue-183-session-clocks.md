---
"@yielded/auth": patch
"@yielded/auth-persistence": patch
"@yielded/auth-persistence-drizzle": patch
---

Apply one opt-in future-clock policy across Auth, SQL sessions, and protected password and passkey actions while preserving strict freshness and expiry. **BEHAVIOR CHANGE:** Custom `AuthenticationAuthority.approve` implementations must validate the prepared `issuedAt` supplied by Auth.
