---
"@yielded/auth-persistence": patch
"@yielded/auth-persistence-drizzle": patch
---

Use shared native SQL workflows through mapped tables or `NativeSqlTables`, with far fewer database round trips per operation. BEHAVIOR CHANGE: update custom adapters to the current `/Adapter` exports and replace removed query-kernel, observation-fence, and legacy transaction helpers.
