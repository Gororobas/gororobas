---
"@yielded/auth": minor
"@yielded/auth-persistence": minor
---

Move SQL adapters into `@yielded/auth-persistence` and add managed schemas, opt-in Layers for Drizzle Kit migrations, and direct Effect SQL persistence for password registration and recovery, email verification, phone sign-in, and stateful sessions.

BEHAVIOR CHANGE: Import Drizzle adapters from `@yielded/auth-persistence/drizzle/*`; both packages now release together at the same version.
