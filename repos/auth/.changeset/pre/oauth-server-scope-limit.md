---
"@yielded/auth": minor
---

Let OAuth and OpenID servers declare up to 1024 scopes instead of 32, as long as their names fit 8192 characters joined by spaces, or 4096 with JWT access tokens. Access token verifiers accept the same limit; upgrade separately deployed verifiers before issuing tokens with more than 32 scopes.
