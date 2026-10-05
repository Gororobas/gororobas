---
"@yielded/auth": patch
"@yielded/auth-crypto": patch
"@yielded/auth-electron": patch
"@yielded/auth-persistence-drizzle": patch
"@yielded/auth-react-native": patch
---

Prepare connected OAuth flows before verifying independent exact-action evidence, and resolve begin, callback and disconnect targets through private server services. **BEHAVIOR CHANGE:** call `prepareBegin` before `begin`, retain its private `connected-intent` credential and original command inputs, map credentials through Operation HTTP, and update custom persistence and transaction protectors for prepared flows and their connected envelopes.
