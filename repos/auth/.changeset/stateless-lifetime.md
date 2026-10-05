---
"@yielded/auth": patch
---

Shorten the default stateless session lifetime to fifteen minutes.

BEHAVIOR CHANGE: Retain an explicit `maxAge` or transitional `maximumIssuedAge` if previously issued longer-lived stateless tokens must remain usable.
