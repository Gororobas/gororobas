---
"@yielded/auth": patch
"@yielded/auth-persistence": patch
"@yielded/auth-persistence-drizzle": patch
---

Protect active codes and reset links from other request attempts, charge only issued proofs, provide configurable request rate limiting by default, and expose `Adapter.makeStorageMappings` for adapter composition. BEHAVIOR CHANGE: supply `Proofs.ProofRequestContext` for non-HTTP calls and provide raw HTTP operation handlers, codecs, and callback services at `server.handle` invocation; standard Auth HTTP routes supply the caller automatically.
