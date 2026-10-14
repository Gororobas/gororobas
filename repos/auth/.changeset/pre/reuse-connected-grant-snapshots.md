---
"@yielded/auth": patch
"@yielded/auth-persistence": patch
"@yielded/auth-persistence-drizzle": patch
---

Reuse the captured OAuth grant for token-use authorization and conditional refresh claims. BEHAVIOR CHANGE: update custom use authorities to accept the supplied snapshot, custom persistence to claim the exact stored grant, and OAuth mappings to remove `decodeActionRequirement`.
