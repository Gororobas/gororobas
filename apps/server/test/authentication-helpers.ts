import { NodeHttpServer } from "@effect/platform-node"
import { assert, expect } from "@effect/vitest"
import { EmailDelivery } from "@yielded/auth"
import { Effect, Layer, Redacted, Schema, Predicate } from "effect"
import { Base64Url } from "effect/encoding"

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

  return {
    deliveries,
    layer,
  }
}

const envelope = Schema.Union([
  Schema.TaggedStruct("Success", {
    value: Schema.optionalKey(Schema.Unknown),
  }),
  Schema.TaggedStruct("Failure", {
    error: Schema.Unknown,
  }),
  Schema.TaggedStruct("TransportFailure", {
    reason: Schema.String,
  }),
])

export const makeAuthenticationTestBrowser = (handler: (request: Request) => Promise<Response>) => {
  // oxlint-disable-next-line effect/avoid-native-object-helpers -- The mutable HTTP cookie jar preserves insertion order when named cookies are replaced.
  const cookies = new Map<string, string>()
  const cookieHeader = () => [...cookies].map(([key, value]) => `${key}=${value}`).join("; ")

  const fetchRoute = Effect.fn(function* ({
    path,
    method = "GET",
    body,
    customHeaders,
  }: {
    path: string
    method?: string | undefined
    body?: unknown
    customHeaders?: Record<string, string> | undefined
  }) {
    const options: RequestInit = {
      method,
      headers: {
        origin: authenticationTestOrigin,
        "content-type": "application/json",
        "x-effect-auth-csrf": "1",
        cookie: cookieHeader(),
        ...customHeaders,
      },
    }

    if (body !== undefined) {
      options.body = yield* Schema.encodeEffect(Schema.fromJsonString(Schema.Unknown))(body)
    }
    const response = yield* Effect.tryPromise(() =>
      handler(new Request(`${authenticationTestOrigin}${path}`, options)),
    )

    response.headers.getSetCookie().forEach((header) => {
      const pair = header.split(";")[0]
      if (pair === undefined) return
      const separator = pair.indexOf("=")
      const key = pair.slice(0, separator)
      const value = pair.slice(separator + 1)
      if (value === "" || /Max-Age=0/i.test(header)) cookies.delete(key)
      else cookies.set(key, value)
      expect(header).toMatch(/HttpOnly/i)
      expect(header).toMatch(/Secure/i)
    })

    return response
  })

  const call = Effect.fn(function* <S extends Schema.ConstraintDecoder<unknown, never>>(
    action: {
      readonly route: {
        readonly path: string
        readonly method: "GET" | "POST"
        readonly operation: {
          readonly rpc: {
            readonly successSchema: S
          }
        }
      }
    },
    // oxlint-disable-next-line effect/no-unknown-parameters -- HTTP tests intentionally submit malformed payloads; the server action schema is the validation boundary.
    payload?: unknown,
  ) {
    const response = yield* fetchRoute({
      path: action.route.path,
      method: action.route.method,
      body:
        action.route.method === "GET"
          ? undefined
          : payload === undefined
            ? {}
            : {
                payload,
              },
    })

    const result = yield* Schema.decodeEffect(envelope)(
      yield* Effect.tryPromise(() => response.json()),
    )
    expect(response.status).toBe(200)
    assert(Predicate.isTagged(result, "Success"), `${action.route.path} failed`)
    return yield* Schema.decodeEffect(action.route.operation.rpc.successSchema)(result.value)
  })

  return {
    fetchRoute,
    call,
    cookieHeader,
  }
}

export const parseDeliveredMagicLink = Effect.fn(function* (message: EmailDelivery.EmailMessage) {
  const match = Redacted.value(message.text).match(/https:\/\/\S+/)
  assert(match !== null, "missing magic link")
  const link = new URL(match[0])
  const proof = yield* EmailDelivery.parseLinkFragment(Redacted.make(link.hash))
  return {
    link,
    proof,
  }
})
