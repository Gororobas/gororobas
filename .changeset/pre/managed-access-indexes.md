---
"@yielded/auth-persistence": patch
"@yielded/auth-persistence-drizzle": patch
---

Include non-unique indexes for managed credential, identifier, session, and pending-authentication lookups. Generate and apply the corresponding database migration to use the indexes.
