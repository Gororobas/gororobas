---
"@yielded/auth-persistence-drizzle": patch
---

Require Drizzle ORM RC5 and use its native Effect 4 support. BEHAVIOR CHANGE: upgrade `drizzle-orm` to `1.0.0-rc.5` or later and remove the `@yielded/drizzle-effect-v4-patch` Bun patch before reinstalling dependencies.
