---
"@yielded/auth-openid-client": patch
---

Expose Google's optional hosted-domain claim at `profile.providerData.hd` for verified Google ID tokens while continuing to ignore other issuers' private claims.
