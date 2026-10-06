import { EmailDelivery } from "@yielded/auth"
import { Config, Effect, Layer, Redacted, Schema } from "effect"
import { FetchHttpClient, HttpClient, HttpClientRequest } from "effect/http"

export const EmailDeliveryResend = Layer.effect(
  EmailDelivery.EmailDelivery,
  Effect.gen(function* () {
    const apiKey = yield* Config.schema(Schema.Redacted(Schema.NonEmptyString), "RESEND_API_KEY")
    const from = yield* Config.NonEmptyString("AUTH_EMAIL_FROM")
    const http = yield* HttpClient.HttpClient

    return EmailDelivery.EmailDelivery.of({
      send: Effect.fn(
        function* (message) {
          const request = yield* HttpClientRequest.post("https://api.resend.com/emails").pipe(
            HttpClientRequest.bearerToken(apiKey),
            HttpClientRequest.bodyJson({
              from,
              to: [message.to],
              subject: message.subject,
              text: Redacted.value(message.text),
              ...(message.html === undefined ? {} : { html: Redacted.value(message.html) }),
            }),
            Effect.mapError(() => EmailDelivery.EmailNotAccepted.make({})),
          )

          const response = yield* http.execute(request).pipe(
            Effect.timeout("10 seconds"),
            Effect.mapError(() => EmailDelivery.EmailAcceptanceUnknown.make({})),
          )

          if (response.status >= 200 && response.status < 300) return

          if ([400, 401, 403, 404, 409, 413, 422, 429].includes(response.status)) {
            return yield* EmailDelivery.EmailNotAccepted.make({})
          }

          return yield* EmailDelivery.EmailAcceptanceUnknown.make({})
        },
        Effect.scoped,
        Effect.provideService(FetchHttpClient.RequestInit, {
          redirect: "error",
          credentials: "omit",
        }),
      ),
    })
  }),
).pipe(Layer.provide(FetchHttpClient.layer))
