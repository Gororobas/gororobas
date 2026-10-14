---
"@yielded/auth-persistence": patch
---

Bound managed SQLite and D1 pending-authentication deletion to the selected unique digest keys when the table has no triggers. Preserve the existing cleanup path for mapped tables and custom clocks.
