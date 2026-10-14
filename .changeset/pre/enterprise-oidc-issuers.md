---
"@yielded/auth": patch
---

Add Okta, Auth0, Keycloak, Zitadel, and Cognito OpenID presets that build each customer's issuer from typed tenant fields. Cognito supplies the missing PKCE advertisement for user-pool issuers, and Auth0 follows the tenant's authorization response issuer setting.
