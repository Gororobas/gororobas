---
"@yielded/auth": patch
"@yielded/oauth": patch
"@yielded/jose": patch
"@yielded/crypto": patch
---

Add `Apple.provider` for Sign in with Apple, with ES256 client-secret JWTs from a `.p8` key. Accept form_post callbacks and first-consent names through direct routes with a `SameSite=None; Secure` request-binding cookie and through the callback proxy.

BEHAVIOR CHANGE: Custom `Signature` services must implement `decodePrivateKey`.
