---
"@yielded/auth-persistence": patch
"@yielded/auth-persistence-drizzle": patch
---

Validate explicit Drizzle mappings against the captured database's physical unique keys before acquiring services or transaction coordinators.

BEHAVIOR CHANGE: Apply application migrations before building adapter Layers and permit database catalog reads; declared constraints alone no longer satisfy acquisition.
