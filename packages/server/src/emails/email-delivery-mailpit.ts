import { EmailDelivery } from "@yielded/auth"
import { Config, Effect, Layer, Redacted } from "effect"
import { FetchHttpClient, HttpClient, HttpClientRequest } from "effect/http"

export const EmailDeliveryMailpit = Layer.effect(
  EmailDelivery.EmailDelivery,
  Effect.gen(function* () {
    const url = yield* Config.String("MAILPIT_URL").pipe(
      Config.withDefault("http://localhost:8025"),
    )
    const from = yield* Config.String("AUTH_EMAIL_FROM").pipe(
      Config.withDefault("auth@gororobas.local"),
    )
    const http = yield* HttpClient.HttpClient
    return EmailDelivery.EmailDelivery.of({
      send: Effect.fn(
        function* (message) {
          const request = yield* HttpClientRequest.post(`${url}/api/v1/send`).pipe(
            HttpClientRequest.bodyJson({
              From: { Email: from, Name: "Gororobas" },
              To: [{ Email: message.to }],
              Subject: message.subject,
              Text: Redacted.value(message.text),
              ...(message.html === undefined ? {} : { HTML: Redacted.value(message.html) }),
            }),
            Effect.mapError(() => EmailDelivery.EmailNotAccepted.make({})),
          )

          const response = yield* http.execute(request).pipe(
            Effect.timeout("10 seconds"),
            Effect.mapError(() => EmailDelivery.EmailAcceptanceUnknown.make({})),
          )

          if (response.status >= 200 && response.status < 300) return

          if ([400, 401, 403, 404, 413, 422].includes(response.status))
            return yield* EmailDelivery.EmailNotAccepted.make({})

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
