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
export const authenticationTestProofKey = Redacted.make(
  Base64Url.encode(new Uint8Array(32).fill(7)),
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

export const makeAuthenticationTestBrowser = (
  handler: (request: Request) => Promise<Response>,
  origin = authenticationTestOrigin,
) => {
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
        origin,
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
      handler(new Request(`${origin}${path}`, options)),
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
      expect(/;\s*Secure(?:;|$)/i.test(header)).toBe(origin.startsWith("https:"))
      expect(key.startsWith("__Host-")).toBe(origin.startsWith("https:"))
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

    const body = yield* Effect.tryPromise(() => response.json())
    expect(response.status, `${action.route.path}: ${JSON.stringify(body)}`).toBe(200)
    const result = yield* Schema.decodeEffect(envelope)(body)
    assert(Predicate.isTagged(result, "Success"), `${action.route.path} failed`)
    return yield* Schema.decodeEffect(action.route.operation.rpc.successSchema)(result.value)
  })

  return {
    fetchRoute,
    call,
    cookieHeader,
  }
}

/** Every sign-in email carries the same code twice: to type in, and in the link's fragment. */
export const parseDeliveredCode = (message: EmailDelivery.EmailMessage) => {
  const text = Redacted.value(message.text)
  const link = text.match(/https?:\/\/\S+/)
  assert(link !== null, "missing sign-in link")
  const url = new URL(link[0])
  const code = /^#code=(\d{6})$/.exec(url.hash)?.[1]
  assert(code !== undefined, "missing code in link")
  expect(text.split("\n")).toContain(code)
  return { code, link: url }
}
