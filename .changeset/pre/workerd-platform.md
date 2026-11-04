---
"@yielded/auth": patch
"@yielded/auth-electron": patch
"@yielded/auth-persistence": patch
"@yielded/auth-persistence-drizzle": patch
"@yielded/auth-platform-workerd": minor
"@yielded/auth-react-native": patch
"@yielded/auth-simplewebauthn": patch
"@yielded/oauth": patch
---

Use Effect crypto and one `WebCrypto.layer` preset, and move Workers password hashing to `@yielded/auth-platform-workerd`. BEHAVIOR CHANGE: require Effect 4.1 and matching SQL drivers; replace `@yielded/crypto` and Auth's Workers subpaths with Effect crypto Layers or the Workers package, supply HTTP and the Kdf for `Testing.services()` separately, and use `Password.KdfAdmission.layer()`, optional `PasswordScrypt.layer`, and opaque Effect keys for JOSE.
