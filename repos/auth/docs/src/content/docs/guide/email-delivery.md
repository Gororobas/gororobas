---
title: Email delivery
description: Connect your email provider to Auth with an Effect service.
---

Auth creates and renders reset/sign-in links or codes. Your application provides
`EmailDelivery` through a Layer using any email provider. It receives `to`,
`subject`, and redacted `text`/optional `html` bodies. Auth queues delivery through
a built-in worker, so public receipts do not wait for the provider.

The transport's `send` returns `Effect<void, EmailNotAccepted | EmailAcceptanceUnknown>`.
Success means the provider accepted the message, not that it reached the inbox.
Use `EmailNotAccepted` only when rejection is certain; use `EmailAcceptanceUnknown`
when sending might have happened. Map typed provider errors without copying their
messages or causes into Auth errors. Defects and interruption must propagate.

## Use a REST API email service

This example uses [SendGrid](https://www.twilio.com/docs/sendgrid/api-reference/mail-send/mail-send)
and Effect's fetch client. Supply `SENDGRID_API_KEY` through your ConfigProvider
and use a verified sender. Adapt the payload and acceptance mapping for other providers.

```ts title="apps/server/email.ts"
import {
  EmailDelivery,
  EmailMessage,
  EmailNotAccepted,
  EmailAcceptanceUnknown,
} from "@yielded/auth/EmailDelivery";
import { Config, Effect, Layer, Redacted } from "effect";
import { FetchHttpClient, HttpClient, HttpClientRequest } from "effect/http";

export const EmailLive = Layer.effect(
  EmailDelivery,
  Effect.gen(function* () {
    const apiKey = yield* Config.Redacted("SENDGRID_API_KEY");
    const http = HttpClient.withScope(yield* HttpClient.HttpClient);

    return EmailDelivery.of({
      send: Effect.fnUntraced(
        function* (message: EmailMessage) {
          const request = yield* HttpClientRequest.post(
            "https://api.sendgrid.com/v3/mail/send",
          ).pipe(
            HttpClientRequest.bearerToken(apiKey),
            HttpClientRequest.bodyJson({
              personalizations: [{ to: [{ email: message.to }] }],
              from: { email: "hello@example.com" },
              subject: message.subject,
              content: [
                { type: "text/plain", value: Redacted.value(message.text) },
                ...(message.html === undefined
                  ? []
                  : [{ type: "text/html", value: Redacted.value(message.html) }]),
              ],
              tracking_settings: {
                click_tracking: { enable: false, enable_text: false },
                open_tracking: { enable: false },
              },
            }),
            Effect.mapError(() => EmailNotAccepted.make({})),
          );

          const response = yield* http.execute(request).pipe(
            Effect.timeout("10 seconds"),
            Effect.mapError(() => EmailAcceptanceUnknown.make({})),
          );

          if (response.status === 202) return;
          if ([400, 401, 403, 404, 405, 413].includes(response.status)) {
            return yield* EmailNotAccepted.make({});
          }
          return yield* EmailAcceptanceUnknown.make({});
        },
        Effect.scoped,
        Effect.provideService(FetchHttpClient.RequestInit, {
          redirect: "error",
          credentials: "omit",
        }),
      ),
    });
  }),
).pipe(Layer.provide(FetchHttpClient.layer));
```

`202` means accepted; the listed rejections are definite. Other responses,
timeouts, and transport failures remain uncertain. Click tracking is disabled
to preserve private links. EU regional subusers use `api.eu.sendgrid.com`.

## Use Alchemy

Alchemy's Cloudflare binding and [AWS SES bindings](https://alchemy.run/aws/email/sending/)
can implement the same `EmailDelivery` service. For Cloudflare, declare
`Cloudflare.Email.SendEmail("AUTH_EMAIL")` in your stack and acquire
`Cloudflare.Email.Send(sender)` inside the Worker's construction Effect.

Build `EmailLive` per request, capturing Alchemy's `RuntimeContext` and providing
it to the send Effect. Do not cache that context across requests. Keep the Auth
scope alive through the Worker's background-work lifetime. `SendEmailError` does
not establish definite rejection, so map it to `EmailAcceptanceUnknown`.
Configure sender permissions and destination eligibility.

For a complete REST-based Cloudflare transport, see the
[account examples' delivery service](https://github.com/yielded-dev/auth/blob/main/examples/shared/account/delivery.ts).

## Compose Auth

Provide your chosen `EmailLive` alongside your application services:

```ts
const AuthLive = AppAuth.layer.pipe(Layer.provide(EmailLive), Layer.provide(AuthDependencies));
```

Build `AuthLive` once in your server's application scope. Auth supplies a worker
with room for 64 pending tasks, running one at a time with a ten-second cancellation
budget. A full queue returns `ProofUnavailable` without waiting for the provider.

Closing the scope cancels delivery. Hosts that suspend after a response, including
Workers, must keep it alive through their background-work mechanism. This also
applies to request-local providers such as Alchemy's binding.

Delivery may begin before the response is sent. Override
`Proofs.ProofDispatchScheduler` if your host requires a post-response start.
`Proofs.ProofDispatchScheduler.layerInline` instead waits for delivery; reserve it
for trusted workflows, not public requests that must conceal account eligibility.

Keep bodies and capability URLs out of logs and telemetry, and disable transport
retries. Delivery is process-local, without a durable outbox or automatic retry.
A crash, queue rejection, or shutdown can leave a proof unsent; an unknown commit
outcome schedules nothing. To resend, explicitly request a new proof after cooldown
with the original binding. Request IDs do not recover earlier receipts or delivery.

## Customize wording

Override `EmailDelivery.EmailRenderer` for wording, HTML, or localization. It
receives purpose, locale, expiry, and a private `Code` or complete `Link`; the
default is plain text. Locale hints contain 1–64 characters and reject control
characters and line separators before rendering; your renderer chooses supported
locales. Return a subject and redacted bodies. Escape HTML and retain the supplied
link.

## Handle links

`Password.resetLink({ url })` and `Email.makeLink({ url })` use a fixed HTTPS landing
page. Auth checks the destination at Layer construction; credentials, query strings,
and fragments are forbidden in the configured URL.

The email link contains only the reference and secret in its fragment. On the
originating client, `EmailDelivery.parseLinkFragment(Redacted.make(location.hash))`
returns `{ reference, secret }`. Remove the fragment immediately with
`history.replaceState`, then wait for an intentional user action before a
same-origin, CSRF-protected POST. Keep the original flow, email and any request-binding
credential; the link does not replace that state. An email scanner's GET must not
issue, verify, or complete authentication.

`EmailDelivery.linkLandingHeaders` provides no-store, no-referrer and restrictive
CSP headers for the static landing response. Adapt its script policy to your UI.
Disable provider click tracking or rewriting that would expose the secret in a
query string or log. See [password recovery](./passwords#recover-a-password) and
[email sign-in](./codes) for the rest of each flow.
