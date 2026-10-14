# Gororobas server

The normal application server runs all implemented API groups, email authentication, and durable workflow registrations. Email is the only sign-in method.

## Run the application

From the workspace root:

```sh
cp apps/server/.env.example apps/server/.env
node -e 'console.log(require("node:crypto").randomBytes(32).toString("base64url"))'
```

Set generated values as `AUTH_BINDING_KEY` and `AUTH_PROOF_KEY` (distinct), and supply `DEEPL_API_KEY` for translation workflows. Start Mailpit with `docker compose -f apps/server/compose.auth.yaml up -d mailpit`, then run:

```sh
pnpm --filter @gororobas/server start
```

The HTTP listener binds port 4000; open `http://localhost:4443/login` through the web app for development authentication. `APP_DB_FILENAME` selects the application database (default `gororobas.db`), `WORKFLOWS_DB_FILENAME` selects workflow storage, and `MEDIA_ASSETS_DIRECTORY` selects the media filesystem root. Relative paths resolve from `apps/server` when using the package command. Shutdown disposes shared SQL/cluster services before exit.

The Gel migration writes to `apps/server/gororobas.db` by default. See the [ingestion instructions](../../packages/migration/README.md) for migration, caching, archives, and HTTP verification. Stop the server before replacing its database. Migration skips workflow submissions; subsequent application activity uses the registered workflows.

## Local authentication

From `apps/server`:

```sh
cp .env.example .env
node -e 'console.log(require("node:crypto").randomBytes(32).toString("base64url"))'
```

Set distinct generated values as `AUTH_BINDING_KEY` and `AUTH_PROOF_KEY` in `.env`, with `AUTH_ORIGIN=http://localhost:4443`, then start Mailpit and the server:

```sh
docker compose -f compose.auth.yaml up -d mailpit
pnpm dev
```

Start the web app with `pnpm --filter @gororobas/web-app dev` from the workspace root and open [the login page](http://localhost:4443/login). Vite proxies authentication and application API requests to port 4000 while preserving the browser's Origin header. `AUTH_ORIGIN` must match the web app's origin exactly.

Open [Mailpit](http://localhost:8025) to read the captured email. Open the sign-in link in the same browser that requested it, or enter the code. New tabs work; a different browser/device needs a new request. Beginning another flow replaces the current browser's pending flow.

HTTP authentication is supported on loopback origins only in development, using cookies without `Secure` or the `__Host-` prefix. Tests and production require an explicit HTTPS `AUTH_ORIGIN` and retains secure `__Host-` cookies. If the optional Caddy HTTPS proxy is running, stop it with `docker compose -f compose.auth.yaml stop auth-proxy` so Vite can use port 4443.

## Configuration

| Variable | Purpose |
| --- | --- |
| `AUTH_BINDING_KEY` | Required 32 random bytes, encoded as base64url; keep stable across restarts/instances. |
| `AUTH_ORIGIN` | Trusted origin, default `http://localhost:4443` in development; required HTTPS origin in tests and production. Also used for emailed links and main API CORS. |
| `NODE_ENV` | `production` selects Resend; `development` (default) and `test` select Mailpit. |
| `RESEND_API_KEY` | Required non-empty API key in production. |
| `MAILPIT_URL` | Local delivery endpoint, default `http://localhost:8025`. |
| `AUTH_EMAIL_FROM` | Required non-empty sender address in production; defaults to `auth@gororobas.local` for Mailpit. |

Production uses [Resend’s email API](https://resend.com/docs/api-reference/emails/send-email) and fails startup if `RESEND_API_KEY` or `AUTH_EMAIL_FROM` is missing or empty. Use a verified sender domain, disable link tracking/rewriting in Resend, and set the actual HTTPS `AUTH_ORIGIN`. The normal application entry point includes its API and workflow layers.

## How sign-in works

Signing in and signing up are one flow, built on `@yielded/auth`'s `Email.makeCode`. The person enters their email; the email carries a 6-digit code and a `/login#code=…` link with the same code, so they can either paste the code or click the link (in the same browser, which holds the request-binding cookie).

Yielded never emails addresses without an account, so requesting a code for an unknown address reserves an _unclaimed_ account (`auth_subjects.claimed_at` is NULL), and its email uses welcome wording. Redeeming the code claims the account and verifies its email. Unclaimed accounts are deleted after a day (`unclaimed-accounts.ts`). Accounts created elsewhere, such as migrated ones, get their email credential on first sign-in.

A signed-in account without a profile is a visitor until onboarding: `POST /people/me/profile` with `{ name }` creates its profile and NEWCOMER person. `GET /people/me/profile` returns `null` until then.

`patches/@yielded__auth@0.1.0-beta.39.patch` keeps Yielded's HTTP middleware from draining request bodies of signed-in API mutations. Drop it once the upstream fix ships.

## Auth HTTP API

The shared `AuthenticationApi` in the domain package drives the routes and Yielded client. Auth POSTs carry `{ "payload": ... }` and require `Origin: <AUTH_ORIGIN>` plus `x-effect-auth-csrf: 1`; browser cookies carry private credentials automatically. Auth responses use Yielded's `Success`/`Failure` envelopes.

1. `POST /api/auth/beginEmailSignIn`: `{ flowId }`; sets the request-binding cookie.
2. `POST /api/auth/requestEmailCode`: `{ flowId, email, returnTarget: "/", requestId, locale }`; returns the proof `reference`. Resend within the same flow after the 30-second cooldown.
3. `POST /api/auth/completeEmailSignIn`: `{ flowId, email, returnTarget, reference, secret }`, where `secret` is the code. The request-binding cookie is required.
4. `POST /api/auth/getSession`, `POST /api/auth/signOut`, and `POST /api/auth/renewSession` use the session cookie.

The Foldkit app serves sign-in and onboarding at `/login`, keeping the pending flow (`flowId`, `email`, `reference`) in `localStorage` so a link opened in a new tab can finish it. The link's code lives only in the URL fragment, which never reaches a server; the app strips it immediately and completes sign-in without a confirmation step, since completion requires the originating browser's request-binding cookie. A wrong code can be retried up to Yielded's attempt limit. Session results contain metadata and claims, never session credentials.

## Verification

From the workspace root:

```sh
pnpm --filter @gororobas/server exec vitest run src/authentication/authentication.test.ts
pnpm run quality-gates
```

The vertical slice uses the real HTTP adapter and database migrations, with captured email delivery. Mailpit is not required for the automated test.
