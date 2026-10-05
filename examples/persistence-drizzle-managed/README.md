# Managed Drizzle account example

A runnable account app: registration, email verification, password and passkey sign-in,
password recovery, and sign-out. Accounts and sessions survive restarts in `.data/auth.sqlite`;
private proof and request-binding keys live in `.data/keys.json`.

No email-provider credentials or database server are needed. From the repository
root, install dependencies and start the example:

```sh
vp install
vp -C examples/persistence-drizzle-managed run start
```

Open http://localhost:4181 and create an account with a name, an email such as
`you@example.com`, and a unique password. Registration signs you in. Sign out,
then sign back in with the same email and password.

In local mode, verification and recovery messages are private JSON files in
`.data/mail/`. Open the newest file for your email address and enter the code in its `text`
in the app. Local delivery simulates an inbox; it does not prove control of a
real address. The server never serves these files or prints codes to its logs.

After verifying your email, sign out and choose **Forgot password?** to try recovery.
Read the new local message and enter its code with a new password. Recovery requires
a verified address. This app accepts passwords from 8 characters; new passwords are screened
with [Pwned Passwords](https://haveibeenpwned.com/API/v3#SearchingPwnedPasswordsByRange),
sending only five SHA-1 prefix characters with response padding.
Screening requires an internet connection and no API key; an unavailable check fails closed.

Pending verification and reset requests survive a refresh in the same tab. A resend
countdown preserves the current code during the cooldown. Only public flow metadata
is kept in session storage; passwords, codes, and private credentials are never stored there.
Confirming the registered email requires a valid session and the emailed code.
Session reads reload application claims, so verification appears immediately without
extending the session or asking for the password again.

While signed in, use **Add passkey** and follow the browser's
prompt. The saved key appears on your account; after signing out, choose **Sign in with
a passkey**. Use `localhost:4181` consistently: passkeys are bound to that relying party
and allowed origin. Cancellation leaves the account signed in without adding a key.
Enrollment requires authentication from the last five minutes. If the app asks you
to sign in again, reauthenticate before adding the passkey; ordinary session reads
and the saved-key list remain available.
Adding a key preserves that session and its original authentication time and assurance.

To send real email, copy `.env.example` to `.env`, set `AUTH_EMAIL_DELIVERY=cloudflare`,
and fill in `CLOUDFLARE_ACCOUNT_ID`, `CLOUDFLARE_API_TOKEN`, and `AUTH_EMAIL_FROM`.
Use an address on your configured Cloudflare sending domain.
[Cloudflare Email Sending](https://developers.cloudflare.com/email-service/api/send-emails/rest-api/)
runs server-side over REST. Ambiguous deliveries are not automatically retried.

The server binds to loopback and uses development cookies. Before deploying,
set your HTTPS origin, Secure cookies and passkey relying party, replace local
delivery, and protect the persistent database and keys. Start with the
[HTTP setup](https://yielded.dev/auth/guide/http-and-client/) and
[passkey setup](https://yielded.dev/auth/guide/passkeys/) guides.

[Schema](src/schema.ts) maps the application's customer table and selects managed
auth tables. [Drizzle Kit](drizzle.config.ts) reads the exported tables and generates
versioned SQL and snapshots in [drizzle](drizzle). After changing the schema, run
from the repository root:

```sh
vp -C examples/persistence-drizzle-managed run db:generate --name=describe_change
```

Generation compacts JSON snapshots to one line; Git marks them as generated.

Review and commit the generated migration. [MigrationsLive](src/migrations.ts) applies
those files with Drizzle before auth starts, recording them in `__drizzle_migrations`.
Run `vp -C examples/persistence-drizzle-managed run db:migrate` from the root to apply them separately.
Startup never generates or pushes schema changes.

[Layers](src/live.ts) provide subject creation, claims, and [custom hashing](../shared/account/hashing.ts). The library commits customer creation,
identifier binding, password storage, and the registration receipt together. Existing
account registration and exact request replays never overwrite a password.
`Passkey.make()` and `Passkey.makeManagement()` enable the managed passkey tables.
`PasskeyConfig` supplies the relying party to both persistence and the server verifier;
the app supplies session authorization and claims.

`AUTH_DATA_DIR` changes the data directory. Removing `.data` resets this example's
accounts, sessions, proofs, and keys. It does not affect the other examples.

The [AuthApi](../shared/account/contract.ts), [AppAuth](../shared/account/auth.ts),
and [client](../shared/account/email-client.ts) are shared with the repository's
other account examples.
This app's [live.ts](src/live.ts) supplies persistence and account Layers;
[delivery.ts](src/delivery.ts) selects local or Cloudflare email.

`vp -C examples/persistence-drizzle-managed run test` checks registration rollback
after credential storage fails, plus password recovery through the client's resend
action, using HTTP against a temporary database.
