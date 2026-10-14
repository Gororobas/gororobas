---
"@yielded/auth": minor
"@yielded/auth-persistence": minor
"@yielded/auth-persistence-drizzle": minor
"@yielded/auth-simplewebauthn": minor
---

Replace passkey claim leases with single-use challenge consumption, retain enrollment authorization from begin, allow in-progress ceremonies to finish with their selected RP profile during rolling deploys, and apply immediate-invalidation requirements only to removal.

BEHAVIOR CHANGE: Remove enrollment completion action proofs, passkey generations, and mutation replay flags; replace `PasskeyCleanupResult` with `CleanupResult` from `@yielded/auth/Persistence`, reset development passkey tables and profile records, and supply a shared Effect limiter for coordinated limits across replicas.
