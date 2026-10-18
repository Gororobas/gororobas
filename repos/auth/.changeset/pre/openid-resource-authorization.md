---
"@yielded/auth": minor
---

Add opt-in OpenID application scopes, resource audiences, signed access tokens, and rotating refresh grants that recheck application authorization while preserving the original authentication time; existing defaults retain opaque UserInfo access without refresh grants.
Expose public-key access verification and infer middleware, authorization, and verified access scopes from branded literal scopes.

BEHAVIOR CHANGE: Declare scope values with `OAuthScope.make("documents:read")` from `@yielded/auth` and pass them in `scopes` arrays. Plain strings are no longer accepted as scope declarations.
