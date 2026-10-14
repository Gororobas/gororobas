---
"@yielded/auth-persistence": patch
"@yielded/auth-persistence-drizzle": patch
---

Allow shared persistence Layers to initialize with the invoking request's SQL connection. Defer direct OAuth factory database access and required schema checks until the first operation.
