---
"@yielded/auth": patch
"@yielded/auth-persistence": patch
"@yielded/auth-persistence-drizzle": patch
"@yielded/auth-crypto": patch
"@yielded/auth-openid-client": patch
"@yielded/auth-react-native": patch
"@yielded/auth-simplewebauthn": patch
---

Require stable Effect and matching SQL drivers, and update Cloudflare integration to effect-cf 0.53. Support Drizzle RC4 with the temporary Drizzle patch CLI when adding Drizzle to an existing Bun app.
