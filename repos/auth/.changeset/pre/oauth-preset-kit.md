---
"@yielded/auth": patch
"@yielded/oauth": patch
---

Let OAuth and OpenID presets carry their own profile schema, accept advertised ES256, PS256 and EdDSA ID tokens, and opt out of PKCE. Sign-in begin accepts prompt and loginHint, and OIDC can merge UserInfo into ID-token claims. EdDSA hash claims use SHA-512. Connected refresh keeps the stored identity and does not re-decode UserInfo-only profile fields.
