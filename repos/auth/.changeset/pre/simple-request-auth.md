---
"@yielded/auth": minor
---

Define shared auth contracts for request-aware local services, named HTTP clients, and automatically synchronized Effect Atom state. Compose auth routes with existing HttpApi groups and use importable Effect Atom queries and mutations with scoped session hydration and shared invalidation.

BEHAVIOR CHANGE: Create service definitions with `Auth.make(contractOrId, options)` and `Client.make(contract, options)`; construct instances with their `.make` Effects. Include `credentials` in manually provided `AuthRequest` values. Mount shared actions with `http.routes()`; session lookup and required-session lookup use GET; sign-out and renewal use POST at their named `/auth` paths. Apply `http.protect` to custom credential-producing HTTP workflows. Set `basePath` in `AuthContract.make` to change their shared prefix.
