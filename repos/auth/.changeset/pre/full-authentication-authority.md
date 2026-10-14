---
"@yielded/auth": patch
"@yielded/auth-persistence": patch
"@yielded/auth-persistence-drizzle": patch
---

Carry complete active factor revisions through password lookup and action authorization without adding factor proofs. BEHAVIOR CHANGE: custom password snapshots and authentication-authority captures must return the full vector, treating requested credential IDs as required anchors even when the list is empty.
