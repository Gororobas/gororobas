---
"@yielded/auth": patch
"@yielded/oauth": patch
---

Add LINE, Roblox, and Railway OpenID sign-in. LINE verifies web-login HS256 ID tokens with the channel secret, Roblox keeps its trailing-slash issuer, and Railway merges UserInfo from its published `/oauth` discovery document.
