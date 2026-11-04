---
"@yielded/auth": minor
---

Remember a public session snapshot in application-supplied local storage and expose its verification state through `auth.identity`. Gate account-owned workflows with `auth.verifiedSession(subjectId)` while preserving remembered local work through offline session failures.

BEHAVIOR CHANGE: Rename custom actions called `identity` or `verifiedSession`, and use `SubjectId` values from `Schema.SubjectId` or an existing identity codec for custom action projections and lifetime inputs; wire values are unchanged.
