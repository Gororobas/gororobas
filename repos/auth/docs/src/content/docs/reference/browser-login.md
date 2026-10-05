---
title: Native browser sign-in
description: Hosted-page integration, native transport, recovery, and Apple association setup.
---

Start with [browser sign-in for desktop and mobile](../guide/browser-login.mdx).

## Server and transport

Share `BrowserLoginContract.make(namespace, Session, { basePath })` with the
clients; match the server's session namespace and route path. Configure the server
with `BrowserLogin.make(sessions, { basePath, clients, lifetimeMillis? })`.
Its `layer` validates configuration and acquires the required services. Mount `login.http`
with `OperationHttpServer` to separate browser and native requests.
`BrowserLoginPersistence.layer` supports SQLite, D1, and PostgreSQL; apply its
migration through your application's migrations. Attempts expire after two
minutes by default (`lifetimeMillis` accepts 1,000–300,000).

Return URLs must match registration exactly, without queries or fragments.
HTTPS callbacks require a public hostname on port 443. The native client needs
`BrowserLogin.Browser`, `BrowserLogin.Vault`, `Crypto.Crypto`, and
`OperationHttpClient.Client`. Share the vault with the transport, omit cookies,
reject redirects, and never retry mutations. Keep credentials in the native host;
expose only public session state to React or Electron renderers.

On iOS, `ephemeral: true` requests a browser session without shared browsing data.
Electron does not support this option.

## Hosted page

Call `routes.describe` with `{ attemptId }` for the registered app name and policy.
Keep it guest-readable even when an expired browser cookie is present.
Authorize the completed sign-in or the account shown for manual confirmation:

```ts
{ attemptId, decision: "continue", expectedSessionId: session.sessionId }
```

For `automatic`, capture the initial browser session once and use
`decision: "automatic"`. Session refreshes must not trigger another approval.
The [hosted Atom workflow](https://github.com/yielded-dev/auth/blob/main/examples/persistence-sql/src/browser-login-banner.tsx)
shows initialization, fresh sign-in, and confirmation.

Navigate to `callbackUrl`; keep it only in memory for a manual return link.
Reuse that URL rather than authorizing again. Use `Cache-Control: no-store` and
`Referrer-Policy: no-referrer`; exclude callback URLs from logs and analytics,
including when the HTTPS destination loads as a web page.

## Recovery

The native session inherits the source's authentication and lifetime limits.
Sign out the old native session before switching accounts.

| Action        | Use                                                           |
| ------------- | ------------------------------------------------------------- |
| `resume`      | Reopen a waiting login after restart.                         |
| `finish(url)` | Complete a host-delivered callback.                           |
| `cancel`      | Retire a waiting attempt; interrupt any active sign-in first. |
| `status`      | Read the attempt's outcome and completion receipt.            |
| `acknowledge` | Retire an uncertain attempt only after reconciliation.        |

**Never retry an uncertain exchange or delete its vault.** Recover and verify the
saved session only if it matches the completion receipt from `status`. Otherwise,
revoke the possibly issued session or wait for its absolute expiry before calling
`acknowledge`. Expiring the login attempt does not expire a session it may have issued.

## Apple association

Association setup is application-owned; the helper is optional. Pass
`BrowserLogin.appleAssociation` only the client registrations belonging to the
specified signed app (`PREFIX.bundleID`). It returns unique callback paths for
the selected origin, not a complete AASA document or proof of deployment.

Keep one complete association document, preserving other apps, content routes,
exclusions, and App Clips. For macOS, combine the contributed callback paths with
that app's existing `applinks.details` components. Components are ordered: an
earlier exclusion can prevent a callback from matching.

| Platform                          | Signed entitlement and matching AASA entry                                   |
| --------------------------------- | ---------------------------------------------------------------------------- |
| iOS 17.4+ authentication sessions | `webcredentials:app.example.com`; app ID in `webcredentials.apps`.           |
| Packaged macOS Electron           | `applinks:app.example.com`; app ID and callback paths in `applinks.details`. |

Serve the complete JSON at `/.well-known/apple-app-site-association` over public
HTTPS, without redirects, with `Content-Type: application/json`; keep its
uncompressed size within 128 KB. Hand-written or CDN-hosted files work equally.
Follow [Apple's setup guide](https://developer.apple.com/documentation/xcode/supporting-associated-domains).

Verify the deployed association and signed app before enabling `automatic`.
Treat every app associated with the host as a trusted receiver. Browser settings
and same-site navigation can keep macOS links in the browser; retain a manual
return action. Never forward an HTTPS callback's code to a custom scheme.
