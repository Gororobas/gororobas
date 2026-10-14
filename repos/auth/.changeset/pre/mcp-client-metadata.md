---
"@yielded/auth": minor
"@yielded/auth-persistence": minor
---

Support MCP client metadata discovery, private-key JWT and shared-secret client authentication, and OAuth 2.1 callback handling. BEHAVIOR CHANGE: supply HttpClient and Signature services to OAuthServer Layers, apply OAuthServerPersistence.migrations for grants and assertion receipts, and implement consumeAssertion in custom persistence adapters; configure trusted metadata origins and network egress for remote discovery.
