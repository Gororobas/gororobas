---
"@yielded/auth": minor
---

Start OAuth sign-in with only `provider` and `returnTarget`; generate attempt IDs on the server and select the configured default callback.

BEHAVIOR CHANGE: Remove `flowId` and `commandId` from named sign-in calls. Custom `OAuthProtocol` implementations must resolve an omitted `callbackId` to the provider-named callback or the only configured callback, and reject ambiguous selection.
