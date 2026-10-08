# Gororobas server

Authentication uses @yielded/auth with magic links and Apple, Google, and Microsoft OAuth/OIDC. The login page is served at `/api/auth/login`; new accounts are provisioned only after mailbox verification. See [the decision log](auth-migration-decisions.md) for storage, session policy, and API limitations.

## Local authentication

From `apps/server`:

```sh
cp .env.auth.example .env.auth
node -e 'console.log(require("node:crypto").randomBytes(32).toString("base64url"))'
```

Set the generated value as `AUTH_BINDING_KEY` in `.env.auth`, then start Mailpit and the HTTPS proxy:

```sh
docker compose -f compose.auth.yaml up -d
pnpm dev:auth
```

Open [the login page](https://localhost:4443/api/auth/login) and [Mailpit](http://localhost:8025). Request a link, open the captured email in the same browser, and confirm sign-in. New tabs work; a different browser/device needs a new request. Beginning another flow replaces the current browser's pending flow.

Caddy uses a local certificate authority. Export its public root certificate and trust it in your browser/OS before opening the login page:

```sh
docker compose -f compose.auth.yaml cp auth-proxy:/data/caddy/pki/authorities/local/root.crt /tmp/gororobas-auth-root.crt
```

On macOS, import that certificate into Keychain Access and explicitly trust it for local development. The private CA key stays in the Docker volume. Both published ports bind only to the loopback interface. The app listener is HTTP on port 4000; browsers should use the HTTPS proxy origin. Mailpit supports [sending messages through its HTTP API](https://mailpit.axllent.org/docs/usage/sending-messages/), so no SMTP library is required.

The standalone auth entry point uses the application database and its initial migration. An old local `gororobas.db` created before this schema reset is incompatible: archive it and start with a fresh file. No existing database files are deleted by this change.

## Configuration

| Variable | Purpose |
| --- | --- |
| `AUTH_BINDING_KEY` | Required 32 random bytes, encoded as base64url; keep stable across restarts/instances. |
| `AUTH_ORIGIN` | Trusted HTTPS origin, default `https://localhost:4443`; also used for the landing URL and main API CORS. |
| `NODE_ENV` | `production` selects Resend; `development` (default) and `test` select Mailpit. |
| `RESEND_API_KEY` | Required non-empty API key in production. |
| `MAILPIT_URL` | Local delivery endpoint, default `http://localhost:8025`. |
| `AUTH_EMAIL_FROM` | Required non-empty sender address in production; defaults to `auth@gororobas.local` for Mailpit. |

Production uses [Resend’s email API](https://resend.com/docs/api-reference/emails/send-email) and fails startup if `RESEND_API_KEY` or `AUTH_EMAIL_FROM` is missing or empty. Use a verified sender domain, disable link tracking/rewriting in Resend, and set the actual HTTPS `AUTH_ORIGIN`. The main application entry point has unrelated incomplete API/workflow wiring documented in the decision log; `dev:auth` runs the complete authentication surface independently.

## OAuth providers

Set `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET`, `APPLE_CLIENT_ID` / `APPLE_CLIENT_SECRET`, and/or `MICROSOFT_CLIENT_ID` / `MICROSOFT_CLIENT_SECRET`. An omitted pair disables its provider; an incomplete pair fails startup. Enabled providers run OIDC discovery at startup. `MICROSOFT_TENANT` defaults to `common`; it can select a particular Entra tenant or `consumers`.

Register these exact redirect URLs using your HTTPS `AUTH_ORIGIN`:

- `/api/auth/google/callback` (GET)
- `/api/auth/apple/callback` (POST with `response_mode=form_post`)
- `/api/auth/microsoft/callback` (GET)

Apple requires a Services ID and an ES256 client-secret JWT created with your Apple developer signing key. Set that JWT as `APPLE_CLIENT_SECRET` and rotate it before expiry. Apple's web redirect must use a registered public HTTPS domain; the localhost setup cannot complete a real Apple login. Register outbound email sources for Apple's private email relay if users will receive magic links at relay addresses.

Google and Apple can create accounts from explicitly verified email claims. Microsoft does not supply that assurance consistently: first sign in through a magic link, then use its provider button to connect the identity within five minutes. Existing email addresses are never automatically linked. An authenticated user can connect any of the providers; that external identity can subsequently sign in without mailbox verification. Revoked credentials and inactive accounts cannot sign in or be silently reactivated.

The provider library validates signed ID tokens, issuer, audience, expiration and nonce. Google and Microsoft additionally use S256 PKCE. One-use SQL flows bind state/provider/flow to the originating browser, expire after at most ten minutes, and are consumed before code exchange. Failed exchange or completion needs a fresh flow. Callback routes only relay to a first-party confirmation page; the page completes through CSRF-protected Yielded operations, keeping Apple's cross-site POST compatible with SameSite=Lax cookies.

Provider configuration and consent screens require credentials from your own provider applications. Automated tests use generated signed ID tokens and a fake upstream transport, plus real Yielded HTTP/session/database integration; they do not call live providers.

## Auth HTTP API

The shared `AuthenticationApi` in the domain package drives the routes and Yielded client. Auth POSTs carry `{ "payload": ... }` and require `Origin: <AUTH_ORIGIN>` plus `x-effect-auth-csrf: 1`; browser cookies carry private credentials automatically. Auth responses use Yielded's `Success`/`Failure` envelopes.

1. `POST /api/auth/beginMagicLink`: `{ flowId }`.
2. `POST /api/auth/requestMagicLink`: `{ flowId, email, name, requestId, language }`.
3. `POST /api/auth/verifyMagicLink`: `{ flowId, email, name, reference, secret }`, after explicit confirmation of the email link. The originating request-binding cookie is required.
4. `POST /api/auth/completeMagicLink`: `{ flowId, email, name, continuationId }`. The continuation and request-binding credentials remain in HttpOnly cookies.
5. `POST /api/auth/beginOAuth`: `{ provider, flowId }`; returns an authorization URL. `POST /api/auth/completeOAuth`: `{ provider, flowId, state, code }`; the request-binding cookie is required.
6. `GET /api/auth/getSession`, `POST /api/auth/signOut`, and `POST /api/auth/renewSession` use the session cookie.

Email links contain their secret only in the fragment. A landing GET does not authenticate. Yielded's `EmailDelivery.parseLinkFragment` is available to typed browser clients; the supplied small page decodes the same fragment format without a browser bundle. Failed completion burns the continuation; request a fresh link. Session results contain metadata and claims, never session credentials.

## Verification

From the workspace root:

```sh
pnpm exec vitest run apps/server/src/authentication/authentication.test.ts
pnpm run quality-gates
```

The vertical slice uses the real HTTP adapter and database migrations, with captured email delivery. Mailpit is not required for the automated test.
