---
"@yielded/auth": minor
---

Mount auth with `AuthHttp.layer` and configure OAuth providers with generated callback routes, signed-cookie flow recovery, and callback customization.

BEHAVIOR CHANGE: Use `GitHub.provider` in the HTTP provider map; use `gitHubOAuthAppProvider` for explicit provider entries in `OpenIdClient.layer`.
