---
"@yielded/auth": patch
"@yielded/auth-persistence": patch
---

Reduce a complete password sign-in to 22 database calls on PostgreSQL and 20 on SQLite by reusing the authority requirement that completion already read, and, without row locks, by reading the attempt and session authority once.
