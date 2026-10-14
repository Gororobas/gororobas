---
"@yielded/auth": patch
---

Bound the default proof request limiter to 10,000 network keys per process, evicting the least recently checked key when full instead of retaining every address.
