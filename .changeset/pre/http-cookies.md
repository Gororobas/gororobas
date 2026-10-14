---
"@yielded/auth": patch
---

Reject unsafe browser cookie names, transport settings, and OAuth SameSite combinations at Layer acquisition.

BEHAVIOR CHANGE: Prefix secure custom cookie names and prefixes with `__Host-`, use `SameSite=Lax` with OAuth, and use insecure cookies only on HTTP loopback origins.
