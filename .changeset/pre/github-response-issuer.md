---
"@yielded/auth": patch
---

Validate GitHub OAuth callbacks against the required `https://github.com/login/oauth` issuer. BEHAVIOR CHANGE: restart pending flows and follow the OAuth guide to re-establish GitHub bindings or grants created with the old issuer; other providers and application data are unaffected.
