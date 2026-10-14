---
"@yielded/auth-persistence": patch
"@yielded/auth-persistence-drizzle": patch
---

Allow composed SQL persistence alongside explicit strategy services, and safely read mapped SQL IDs with differing physical types. Keep passkey, session, and pending-authentication reads coherent across independently bound SQL mappings, including session pagination during authority changes.
