---
"@yielded/auth": patch
"@yielded/auth-persistence": patch
"@yielded/auth-persistence-drizzle": patch
---

Add opt-in stateful session cookie caching with bounded staleness, authoritative fresh reads, and diagnostics for cache failures. Default session signing keys from the application secret in `Auth.AuthConfig` or `AUTH_SECRET`.

BEHAVIOR CHANGE: Configure the application secret or override `Sessions.SessionSigningKeys` instead of passing constructor keys. `getSession({ fresh: true })` bypasses caching; its HTTP route now uses POST, and its Atom binding is a family (`auth.session` remains the default query). Handle `cache-expiry` invalidation windows and include `session-cache` in custom credential-slot and native-header mappings.
