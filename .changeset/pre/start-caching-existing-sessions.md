---
"@yielded/auth": patch
"@yielded/auth-persistence": patch
"@yielded/auth-persistence-drizzle": patch
---

Keep cached session reads database-free by deferring composed SQL persistence initialization until its first storage operation. Start cookie caching automatically for existing browser sessions after enabling `cacheFor`, without requiring another sign-in or renewal.
