---
"@yielded/auth": patch
"@yielded/auth-persistence": patch
"@yielded/auth-persistence-drizzle": patch
---

Compose email code and magic-link sign-in with managed or mapped persistence, including proof storage and verified-email lookup. Support stateless sessions for email sign-in alongside OAuth.

BEHAVIOR CHANGE: Definitions with email sign-in now require `emailCredentials` and `proofs` in managed migrations or mapped tables.
