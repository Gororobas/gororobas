---
title: Enterprise OpenID
description: Sign in with a customer Okta, Auth0, Keycloak, Zitadel, or Cognito issuer.
---

Each customer has their own OpenID issuer. These presets build that identifier
from typed tenant fields and run the [shared OIDC flow](./oauth). They verify an
ID token and establish your application's session. They do not install a
connection registry, domain discovery, or SAML.

The HTTP host supplies the provider key and callback. Register
`https://app.example.com/auth/{provider}/callback` at the identity provider.

## Configure a tenant

```ts title="apps/server/okta.ts"
import { Config, Effect, Layer } from "effect";
import { Http, Okta } from "@yielded/auth";

import { AppAuth } from "./auth";

export const AuthRoutes = Layer.unwrap(
  Effect.gen(function* () {
    return Http.layer(AppAuth, {
      origin: yield* Config.String("APP_ORIGIN"),
      oauth: {
        providers: {
          okta: Okta.provider({
            domain: yield* Config.String("OKTA_DOMAIN"),
            clientId: yield* Config.String("OKTA_CLIENT_ID"),
            clientSecret: yield* Config.Redacted("OKTA_CLIENT_SECRET"),
            scopes: ["openid", "profile", "email"],
          }),
        },
      },
    });
  }),
);
```

[Supply HTTP, crypto, persistence and application services](../reference/oauth#supply-the-services)
to this Layer. Keep it alive for the server's lifetime. The default scope is
`openid`. Start with `auth.signIn({ provider: "okta", returnTarget: "/account" })`
and redirect to the returned authorization URL.

Use `Auth0.provider`, `Keycloak.provider`, `Zitadel.provider`, or
`Cognito.provider` the same way. Replace the provider key in `Http.layer` so the
callback path matches the registration.

## Issuer helpers

Pass the tenant fields to `provider`. `issuer(...)` only builds the issuer
string. It does not carry that preset's discovery supplement.

| Preset     | Input                                                            | Issuer                                                                                  |
| ---------- | ---------------------------------------------------------------- | --------------------------------------------------------------------------------------- |
| `Okta`     | `domain`, optional `authorizationServer` (defaults to `default`) | `https://{domain}/oauth2/default`. `authorizationServer: "org"` uses `https://{domain}` |
| `Auth0`    | `domain` (`tenant.us.auth0.com` or a custom hostname)            | `https://{domain}/` with the trailing slash Auth0 publishes                             |
| `Keycloak` | `url` (HTTPS origin, optional `/auth` prefix) and `realm`        | `{url}/realms/{realm}`                                                                  |
| `Zitadel`  | `domain` (`instance.zitadel.cloud` or a custom hostname)         | `https://{domain}`                                                                      |
| `Cognito`  | `region` and `userPoolId` (`us-east-1` and `us-east-1_AbCdEfGh`) | `https://cognito-idp.{region}.amazonaws.com/{userPoolId}`                               |

The user-pool identifier must start with the region. Cognito's Hosted UI domain
(`{prefix}.auth.{region}.amazoncognito.com` or a custom domain) is not the
issuer. Discovery at the user-pool issuer returns those authorize and token
URLs. Passing the Hosted UI origin as `issuer` fails configuration.

```ts
import { Cognito, OpenIdConnect } from "@yielded/auth";

OpenIdConnect.provider({
  protocol: "oidc",
  issuer: Cognito.issuer({ region: "us-east-1", userPoolId: "us-east-1_AbCdEfGh" }),
  clientId,
  clientSecret,
  responseIssuerMode: "unsupported",
  pkceS256: false,
  profileSchema: OpenIdConnect.OidcUserProfile,
});
```

Cognito omits response-issuer support and S256 from discovery. The generic
registration above sets both opt-outs so configuration accepts that document.
Replace `profileSchema` with your own schema when you need tenant claims.
`Cognito.provider` keeps S256 PKCE by supplying the missing advertisement for a
`cognito-idp` user-pool issuer. Use that preset when `OidcUserProfile` is enough.

## Identity

The durable identity is `(provider key, tenant issuer, verified sub)`. Keep
`sub` unchanged. Never link accounts merely because profile emails match, even
when `email_verified` is true.

The presets carry `OpenIdConnect.OidcUserProfile` through ID-token projection.
Declare it on the strategy to get typed `providerData` in `SessionClaims.resolve`.
Tenant-specific claims belong in your own `profileSchema` on
`OpenIdConnect.provider`.

## Protocol profile

These hosts advertise S256 PKCE except Cognito, which documents PKCE and omits
it from discovery. The Cognito preset supplies that missing advertisement only
when the issuer is a `cognito-idp` user-pool URL and JWKS is
`{issuer}/.well-known/jwks.json`. Keycloak advertises RFC 9207 `iss`, and
`Keycloak.provider` requires it. Auth0's tenant setting
`authorization_response_iss_parameter_supported` defaults to off and can be
turned on. `Auth0.provider` follows that discovery flag: a callback `iss` must
match the issuer when the flag is advertised, and a callback `iss` is rejected
when it is not. Okta, Zitadel, Cognito, and Auth0 still use a distinct callback
URL, because an Auth0 tenant may leave the flag off. Unexpected callback `iss`
values are rejected; the signed ID token must still have the configured issuer.

No UserInfo request or retained API access is installed. Use
`registrations` with one active generation and retired previous generations for
[credential rotation](../reference/oauth#configuration-rotation).
