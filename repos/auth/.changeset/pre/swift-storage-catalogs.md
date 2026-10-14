---
"@yielded/auth-persistence": patch
"@yielded/auth-persistence-drizzle": patch
---

Reduce SQL persistence acquisition latency across PostgreSQL, SQLite, MySQL and D1 while continuing to reject missing columns and unique keys. Avoid repeated passkey initialization writes when current policy and admission ownership already match.
