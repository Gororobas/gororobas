---
"@yielded/auth": patch
"@yielded/oauth": patch
---

Use Effect's bundled JOSE implementation and require Effect 4.1.2 across the package family. Replace `@yielded/jose` imports with `effect/jose`; use Effect durations for JWT age and remote JWKS settings, and match JOSE errors through their typed `reason`.
