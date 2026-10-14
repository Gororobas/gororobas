---
"@yielded/auth": minor
"@yielded/auth-persistence": minor
"@yielded/auth-persistence-drizzle": minor
---

Retain provider access through `OAuth.make({ access: profile })` with shared Auth sessions, grant storage, refresh, and disconnect; remove OAuthApp and its separate persistence adapter.

BEHAVIOR CHANGE: Reset development OAuthApp cookies/flows/grants and older connected token envelopes, then configure the shared sign-in and connected services; preserve account identities and outstanding reconciliation receipts.
