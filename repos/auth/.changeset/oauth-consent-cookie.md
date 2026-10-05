---
"@yielded/auth": patch
---

Protect HTTPS authorization consent cookies with the host prefix and root path.

BEHAVIOR CHANGE: Read `cookieName` from the acquired authorization server `Service` and restart pending authorization flows after upgrading.
