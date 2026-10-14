---
"@yielded/auth-persistence": patch
"@yielded/auth-persistence-drizzle": patch
---

Reduce SQL session verification to one read for compatible stateful mappings and state-assisted validity, preserving immediate invalidation. Retain safe fallbacks for custom codecs and physical column differences, and preserve caller transactions after verification errors.
