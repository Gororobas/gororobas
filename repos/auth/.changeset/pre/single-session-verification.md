---
"@yielded/auth": patch
---

Avoid duplicate requests when a named query discovers the account, including session reads with or without an SSR seed. Preserve account cleanup and forward explicit refreshes of seeded sessions.
