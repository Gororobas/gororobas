---
"@yielded/auth": patch
---

Configure GitHub sign-in with `GitHub.layer({ clientId, clientSecret, redirectUri })` and compose hosts with `GitHub.provider` and `OpenIdClient.layer`. Apply the same callback, generation, issuance, and timeout defaults to connected accounts through `GitHub.layerConnected` and `OpenIdClientConnected.layer`, while retaining explicit rotation and provider security settings.
