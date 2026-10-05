---
"@yielded/auth": patch
"@yielded/auth-persistence": patch
---

Preserve existing authentication when adding a passkey and allow application-defined authorization freshness limits.

BEHAVIOR CHANGE: `PasskeyEnrolled` and `PasskeyManagementPersistence.completeEnrollment` no longer include `invalidation`; custom persistence must preserve the subject security revision during enrollment.
