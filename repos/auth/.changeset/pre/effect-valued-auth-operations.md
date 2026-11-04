---
"@yielded/auth": patch
"@yielded/auth-react-native": patch
---

Expose no-argument session actions, TOTP entropy operations, and React Native passkey construction as reusable Effects. BEHAVIOR CHANGE: yield `auth.requireSession`, `auth.signOut`, `auth.renewSession`, `TotpCryptography.randomId`, `TotpCryptography.generateSecret`, and `ReactNativePasskey.make` instead of calling them; HTTP client methods keep their existing call signatures.
