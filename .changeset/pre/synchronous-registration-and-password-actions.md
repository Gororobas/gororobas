---
"@yielded/auth": minor
"@yielded/auth-persistence": minor
"@yielded/auth-persistence-drizzle": minor
---

Remove prepared password intents, pending registration, and unused hook composition APIs; use synchronous idempotent provisioning and recent session step-up for password changes.

BEHAVIOR CHANGE: Replace `PasswordKdfAdmission` with `KdfAdmission` from `@yielded/crypto/KdfAdmission`, complete provisioning before returning, and use passkey sign-in followed by a password change when recovering with a passkey. Remove hook outbox/deferred options and the second argument to `coordinateCommit`; provide a shared Effect rate limiter to coordinate password attempt budgets across replicas.
