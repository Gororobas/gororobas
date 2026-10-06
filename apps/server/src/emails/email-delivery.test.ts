import { NodeHttpServer } from "@effect/platform-node"
import { EmailDelivery } from "@yielded/auth"
import { ConfigProvider, Effect, Exit, Layer, Redacted, Schema } from "effect"
import { Base64Url } from "effect/encoding"
import { FetchHttpClient, HttpRouter } from "effect/http"
import { expect, test } from "vitest"

import { AuthenticationLive } from "../authentication/authentication-live.js"
import { ServerServicesLive } from "../server-services.js"
import { AppSqlTest } from "../sql.js"
import { EmailDeliveryResend } from "./email-delivery-resend.js"

const configuration = (values: Record<string, string>) =>
  Layer.succeed(ConfigProvider.ConfigProvider, ConfigProvider.fromUnknown(values))

const message = Schema.decodeUnknownSync(EmailDelivery.EmailMessage)({
  to: "recipient@example.com",
  subject: "Sign in",
  text: Redacted.make("private link"),
  html: Redacted.make("<p>private link</p>"),
})

test.each([
  [200, undefined],
  [400, "EmailNotAccepted"],
  [401, "EmailNotAccepted"],
  [422, "EmailNotAccepted"],
  [429, "EmailNotAccepted"],
  [500, "EmailAcceptanceUnknown"],
] as const)("Resend sends rendered email and classifies HTTP %i", async (status, errorTag) => {
  const requests: Request[] = []
  const transport: typeof fetch = async (input, init) => {
    requests.push(new Request(input, init))
    return new Response(null, { status })
  }
  const result = await Effect.runPromise(
    Effect.gen(function* () {
      const delivery = yield* EmailDelivery.EmailDelivery
      return yield* delivery.send(message).pipe(Effect.result)
    }).pipe(
      Effect.provide(
        EmailDeliveryResend.pipe(
          Layer.provide(
            configuration({
              RESEND_API_KEY: "test-api-key",
              AUTH_EMAIL_FROM: "Gororobas <auth@example.com>",
            }),
          ),
        ),
      ),
      Effect.provideService(FetchHttpClient.Fetch, transport),
    ),
  )
  const request = requests[0]
  expect(requests).toHaveLength(1)
  if (request === undefined) throw new Error("missing email request")
  expect(request.url).toBe("https://api.resend.com/emails")
  expect(request.method).toBe("POST")
  expect(request.headers.get("authorization")).toBe("Bearer test-api-key")
  expect(request.redirect).toBe("error")
  expect(request.credentials).toBe("omit")
  expect(await request.json()).toEqual({
    from: "Gororobas <auth@example.com>",
    to: ["recipient@example.com"],
    subject: message.subject,
    text: Redacted.value(message.text),
    html: "<p>private link</p>",
  })
  expect(result._tag).toBe(errorTag === undefined ? "Success" : "Failure")
  expect(result._tag === "Failure" ? result.failure._tag : undefined).toBe(errorTag)
})

test.each([
  { NODE_ENV: "development" },
  { NODE_ENV: "test" },
  { NODE_ENV: "production", RESEND_API_KEY: "test", AUTH_EMAIL_FROM: "auth@example.com" },
  { NODE_ENV: "production" },
  { NODE_ENV: "production", RESEND_API_KEY: "test" },
  { NODE_ENV: "production", RESEND_API_KEY: "", AUTH_EMAIL_FROM: "auth@example.com" },
  { NODE_ENV: "production", RESEND_API_KEY: "test", AUTH_EMAIL_FROM: "" },
])("auth delivery selection validates configuration: %j", async (values) => {
  const shouldStart =
    values.NODE_ENV !== "production" || Boolean(values.RESEND_API_KEY && values.AUTH_EMAIL_FROM)
  const exit = await Effect.runPromiseExit(
    Layer.build(
      AuthenticationLive.pipe(
        Layer.provide(ServerServicesLive),
        Layer.provide(AppSqlTest),
        Layer.provide(HttpRouter.layer),
        Layer.provide(NodeHttpServer.layerHttpServices),
        Layer.provide(
          configuration({
            AUTH_BINDING_KEY: Base64Url.encode(new Uint8Array(32).fill(42)),
            ...values,
          }),
        ),
      ),
    ).pipe(Effect.scoped),
  )
  expect(Exit.isSuccess(exit)).toBe(shouldStart)
})
