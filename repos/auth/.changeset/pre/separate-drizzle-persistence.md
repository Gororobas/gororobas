---
"@yielded/auth-persistence": minor
"@yielded/auth-persistence-drizzle": minor
---

Move Drizzle persistence and migration helpers into `@yielded/auth-persistence-drizzle`, leaving the default SQL package free of Drizzle dependencies and declarations.

BEHAVIOR CHANGE: Import mappings from the companion root and drivers from explicit modules such as `@yielded/auth-persistence-drizzle/SqliteBun` instead of `@yielded/auth-persistence/drizzle/*`.
