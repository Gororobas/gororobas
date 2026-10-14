---
"@yielded/auth": minor
"@yielded/auth-persistence": minor
"@yielded/auth-persistence-drizzle": minor
---

BEHAVIOR CHANGE: Consume OAuth callbacks once, confirm account links only at begin, and preserve existing sessions when linking. Replace prepared connections and durable unlink replay with direct operations; reset development OAuth flow, registration-intent, connected-grant, and revocation state and update the explicit mappings.
