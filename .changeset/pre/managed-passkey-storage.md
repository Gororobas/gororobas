---
"@yielded/auth": patch
"@yielded/auth-persistence": patch
---

Compose Drizzle passkey sign-in and management storage from the Auth definition, with opt-in managed tables and migrations.

BEHAVIOR CHANGE: Return Effects from `write.policy.requirement` and `write.policy.remainingSignIn` in explicit passkey mappings, for example `() => Effect.succeed(requirement)`.
