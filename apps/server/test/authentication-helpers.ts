import { NodeHttpServer } from "@effect/platform-node"
import { EmailDelivery } from "@yielded/auth"
import { Effect, Layer, Redacted, Schema } from "effect"
import { Base64Url } from "effect/encoding"
import { expect } from "vitest"

import { TestLayer } from "./test-helpers.js"

export const authenticationTestOrigin = "https://localhost:4443"
export const authenticationTestBindingKey = Redacted.make(
  Base64Url.encode(new Uint8Array(32).fill(42)),
)
export const AuthenticationTestInfrastructure = TestLayer.pipe(
  Layer.provideMerge(NodeHttpServer.layerHttpServices),
)

export const captureEmailDelivery = () => {
  const deliveries: EmailDelivery.EmailMessage[] = []

  const layer = Layer.succeed(EmailDelivery.EmailDelivery, {
    send: (message) =>
      Effect.sync(() => {
        deliveries.push(message)
      }),
  })

  return { deliveries, layer }
}

const envelope = Schema.Union([
  Schema.TaggedStruct("Success", { value: Schema.optionalKey(Schema.Unknown) }),
  Schema.TaggedStruct("Failure", { error: Schema.Unknown }),
  Schema.TaggedStruct("TransportFailure", { reason: Schema.String }),
])

export const makeAuthenticationTestBrowser = (handler: (request: Request) => Promise<Response>) => {
  const cookies = new Map<string, string>()
  const cookieHeader = () => [...cookies].map(([key, value]) => `${key}=${value}`).join("; ")

  const fetchRoute = async ({
    path,
    method = "GET",
    body,
    customHeaders,
  }: {
    path: string
    method?: string | undefined
    body?: unknown
    customHeaders?: Record<string, string> | undefined
  }) => {
    const response = await handler(
      new Request(`${authenticationTestOrigin}${path}`, {
        method,
        headers: {
          origin: authenticationTestOrigin,
          "content-type": "application/json",
          "x-effect-auth-csrf": "1",
          cookie: cookieHeader(),
          ...customHeaders,
        },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      }),
    )

    for (const header of response.headers.getSetCookie()) {
      const pair = header.split(";")[0]
      if (pair === undefined) continue
      const separator = pair.indexOf("=")
      const key = pair.slice(0, separator)
      const value = pair.slice(separator + 1)
      if (value === "" || /Max-Age=0/i.test(header)) cookies.delete(key)
      else cookies.set(key, value)
      expect(header).toMatch(/HttpOnly/i)
      expect(header).toMatch(/Secure/i)
    }

    return response
  }

  const call = async <S extends Schema.ConstraintDecoder<unknown, never>>(
    action: {
      readonly route: {
        readonly path: string
        readonly method: "GET" | "POST"
        readonly operation: { readonly rpc: { readonly successSchema: S } }
      }
    },
    payload?: unknown,
  ) => {
    const response = await fetchRoute({
      path: action.route.path,
      method: action.route.method,
      body: action.route.method === "GET" ? undefined : payload === undefined ? {} : { payload },
    })

    const result = Schema.decodeUnknownSync(envelope)(await response.json())
    expect(response.status).toBe(200)
    if (result._tag !== "Success") throw new Error(`${action.route.path} failed`)
    return Schema.decodeUnknownSync(action.route.operation.rpc.successSchema)(result.value)
  }

  return { fetchRoute, call, cookieHeader }
}

export const parseDeliveredMagicLink = (message: EmailDelivery.EmailMessage) => {
  const match = Redacted.value(message.text).match(/https:\/\/\S+/)
  if (match === null) throw new Error("missing magic link")
  const link = new URL(match[0])
  return Effect.map(EmailDelivery.parseLinkFragment(Redacted.make(link.hash)), (proof) => ({
    link,
    proof,
  }))
}
