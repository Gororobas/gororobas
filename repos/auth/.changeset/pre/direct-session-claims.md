---
"@yielded/auth": minor
---

Rename each sign-in strategy's claims service to `SessionClaims` and expose `subjectId` directly to account lookups.

BEHAVIOR CHANGE: Replace `ClaimsForPassword`, `ClaimsForPasskey`, `ClaimsForEmail`, `ClaimsForPhone`, and `ClaimsForOAuth` with `SessionClaims`; implement `resolve({ subjectId, credential })`, or `resolve({ subjectId, credential, identity })` for OAuth.
