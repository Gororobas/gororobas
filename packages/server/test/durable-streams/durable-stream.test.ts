import { stream } from "@durable-streams/client"
import { NodeHttpServer } from "@effect/platform-node"
import { describe, expect, it } from "@effect/vitest"
import { Effect, Layer, Match, Option, Schema } from "effect"
import { FastCheck } from "effect/testing"
import {
  FetchHttpClient,
  HttpClient,
  HttpClientRequest,
  Headers,
  HttpRouter,
  HttpServer,
} from "effect/unstable/http"
import { v7 } from "uuid"

import { makeDurableStreamRouter } from "../../src/durable-streams/router.js"
import {
  VegetableStreamEvent,
  VegetableStreamEventBinary,
} from "../../src/durable-streams/schemas.js"
import {
  DurableStreamsConfig,
  DurableStreamsServiceLive,
} from "../../src/durable-streams/service.js"

const VegetableStreamEventArbitrary = Schema.toArbitrary(VegetableStreamEvent)(FastCheck)

const generateTestEvent = (): VegetableStreamEvent => {
  return Option.getOrThrow(
    Option.fromNullishOr(FastCheck.sample(VegetableStreamEventArbitrary, 1)[0]),
  )
}

const config: DurableStreamsConfig = {
  dataDir: "./test/durable-streams/data",
}

const ServiceLayer = DurableStreamsServiceLive(config)

const RouterLayer = HttpRouter.serve(makeDurableStreamRouter).pipe(Layer.provide(ServiceLayer))

const TestLayers = Layer.provideMerge(
  RouterLayer,
  Layer.mergeAll(NodeHttpServer.layerTest, FetchHttpClient.layer),
)

class DurableStreamTestError extends Schema.TaggedError<DurableStreamTestError>()(
  "DurableStreamTestError",
  { message: Schema.String },
) {}

const executeRequest = (request: HttpClientRequest.HttpClientRequest) =>
  Effect.gen(function* () {
    const client = yield* HttpClient.HttpClient
    return yield* client.execute(request).pipe(Effect.scoped)
  })

const getBaseUrl = Effect.gen(function* () {
  const server = yield* HttpServer.HttpServer
  const address = server.address
  return Match.value(address).pipe(
    Match.when({ _tag: "TcpAddress" }, ({ port }) => `http://localhost:${port}`),
    Match.orElse(() => ""),
  )
})

const findJsonEnd = (
  text: string,
  position: number,
  depth = 0,
  stringMode = false,
  escapeMode = false,
): number => {
  if (position >= text.length) return position
  const char = text[position]
  if (escapeMode) return findJsonEnd(text, position + 1, depth, stringMode, false)
  if (char === "\\") return findJsonEnd(text, position + 1, depth, stringMode, true)
  if (char === '"') return findJsonEnd(text, position + 1, depth, !stringMode, false)
  if (stringMode) return findJsonEnd(text, position + 1, depth, true, false)
  if (char === "{" || char === "[") return findJsonEnd(text, position + 1, depth + 1)
  if (char === "}" || char === "]") {
    const nextDepth = depth - 1
    return nextDepth === 0 ? position + 1 : findJsonEnd(text, position + 1, nextDepth)
  }
  return findJsonEnd(text, position + 1, depth)
}

const parseJsonMessages = (text: string, position = 0, messages: ReadonlyArray<unknown> = []) => {
  if (position >= text.length) return messages
  if (text[position] !== "{") return parseJsonMessages(text, position + 1, messages)
  const end = findJsonEnd(text, position)
  const message = Schema.decodeUnknownSync(Schema.fromJsonString(Schema.Unknown))(
    text.slice(position, end),
  )
  return parseJsonMessages(text, end, [...messages, message])
}

const collectBodyAndParseJson = (response: Awaited<ReturnType<typeof stream>>) =>
  Effect.gen(function* () {
    const body = yield* Effect.tryPromise({
      try: () => response.body(),
      catch: (error) => new DurableStreamTestError({ message: String(error) }),
    })
    const text = new TextDecoder().decode(body)
    return parseJsonMessages(text)
  })

const appendEvent = (baseUrl: string, streamName: string, event: VegetableStreamEvent) =>
  Effect.gen(function* () {
    const encoded = yield* Schema.encodeEffect(VegetableStreamEventBinary)(event)
    return yield* executeRequest(
      HttpClientRequest.post(`${baseUrl}/stream/${streamName}`).pipe(
        HttpClientRequest.setHeader("content-type", "application/octet-stream"),
        HttpClientRequest.bodyUint8Array(new Uint8Array(encoded)),
      ),
    )
  })

const createStream = (baseUrl: string, streamName: string) =>
  executeRequest(HttpClientRequest.put(`${baseUrl}/stream/${streamName}`))

const runDurableStreamIntegration = false

describe.runIf(runDurableStreamIntegration)("DurableStream proxy integration", () => {
  it.effect("should create a stream via PUT and read empty", () =>
    Effect.gen(function* () {
      const baseUrl = yield* getBaseUrl
      const streamName = `test-create-${v7()}`

      const createResponse = yield* createStream(baseUrl, streamName)
      expect(createResponse.status).toBe(201)

      const response = yield* executeRequest(
        HttpClientRequest.get(`${baseUrl}/stream/${streamName}?offset=-1`),
      )
      expect(response.status).toBe(200)
      expect(Headers.has(response.headers, "stream-next-offset")).toBe(true)
    }).pipe(Effect.provide(TestLayers)),
  )

  it.effect("should append and read back via durable streams protocol", () =>
    Effect.gen(function* () {
      const baseUrl = yield* getBaseUrl
      const streamName = `test-append-${v7()}`
      const event = generateTestEvent()

      yield* createStream(baseUrl, streamName)

      const appendResponse = yield* appendEvent(baseUrl, streamName, event)
      expect(appendResponse.status).toBeLessThan(300)

      const response = yield* Effect.tryPromise({
        try: () =>
          stream({
            url: `${baseUrl}/stream/${streamName}`,
            offset: "-1",
            live: false,
          }),
        catch: (error) => new DurableStreamTestError({ message: String(error) }),
      })

      const jsonMessages = yield* collectBodyAndParseJson(response)
      expect(jsonMessages).toHaveLength(1)

      const decoded = yield* Schema.decodeUnknownEffect(VegetableStreamEvent)(jsonMessages[0])
      expect(decoded.event).toBe(event.event)
      expect(decoded.vegetable_id).toBe(event.vegetable_id)
    }).pipe(Effect.provide(TestLayers)),
  )

  it.effect("should support reading from a specific offset", () =>
    Effect.gen(function* () {
      const baseUrl = yield* getBaseUrl
      const streamName = `test-offset-${v7()}`
      const event1 = generateTestEvent()
      const event2 = generateTestEvent()

      yield* createStream(baseUrl, streamName)

      yield* appendEvent(baseUrl, streamName, event1)

      const firstRead = yield* Effect.tryPromise({
        try: () =>
          stream({
            url: `${baseUrl}/stream/${streamName}`,
            offset: "-1",
            live: false,
          }),
        catch: (error) => new DurableStreamTestError({ message: String(error) }),
      })
      const firstMessages = yield* collectBodyAndParseJson(firstRead)
      expect(firstMessages).toHaveLength(1)
      const offsetAfterFirst = firstRead.offset

      yield* appendEvent(baseUrl, streamName, event2)

      const secondRead = yield* Effect.tryPromise({
        try: () =>
          stream({
            url: `${baseUrl}/stream/${streamName}`,
            offset: offsetAfterFirst,
            live: false,
          }),
        catch: (error) => new DurableStreamTestError({ message: String(error) }),
      })
      const secondMessages = yield* collectBodyAndParseJson(secondRead)
      expect(secondMessages).toHaveLength(1)

      const decoded = yield* Schema.decodeUnknownEffect(VegetableStreamEvent)(secondMessages[0])
      expect(decoded.event).toBe(event2.event)
    }).pipe(Effect.provide(TestLayers)),
  )

  it.effect("should handle multiple events in sequence", () =>
    Effect.gen(function* () {
      const baseUrl = yield* getBaseUrl
      const streamName = `test-multi-${v7()}`
      const events = [generateTestEvent(), generateTestEvent(), generateTestEvent()]

      yield* createStream(baseUrl, streamName)

      yield* Effect.forEach(events, (event) => appendEvent(baseUrl, streamName, event), {
        concurrency: 1,
      })

      const response = yield* Effect.tryPromise({
        try: () =>
          stream({
            url: `${baseUrl}/stream/${streamName}`,
            offset: "-1",
            live: false,
          }),
        catch: (error) => new DurableStreamTestError({ message: String(error) }),
      })

      const jsonMessages = yield* collectBodyAndParseJson(response)
      expect(jsonMessages).toHaveLength(3)

      yield* Effect.forEach(
        events,
        (event, index) =>
          Effect.gen(function* () {
            const decoded = yield* Schema.decodeUnknownEffect(VegetableStreamEvent)(
              jsonMessages[index],
            )
            expect(decoded.event).toBe(event.event)
            expect(decoded.vegetable_id).toBe(event.vegetable_id)
          }),
        { concurrency: 1 },
      )
    }).pipe(Effect.provide(TestLayers)),
  )

  it.effect("should support SSE live mode via the proxy", () =>
    Effect.gen(function* () {
      const baseUrl = yield* getBaseUrl
      const streamName = `test-sse-${v7()}`
      const event = generateTestEvent()

      yield* createStream(baseUrl, streamName)

      yield* appendEvent(baseUrl, streamName, event)

      const response = yield* Effect.tryPromise({
        try: () =>
          stream({
            url: `${baseUrl}/stream/${streamName}`,
            offset: "-1",
            live: "sse",
          }),
        catch: (error) => new DurableStreamTestError({ message: String(error) }),
      })

      const text = yield* Effect.tryPromise({
        try: () => response.text(),
        catch: (error) => new DurableStreamTestError({ message: String(error) }),
      })

      expect(text.trim()).toBeTruthy()
      const parsed = Schema.decodeUnknownSync(Schema.fromJsonString(Schema.Unknown))(text)
      const decoded = yield* Schema.decodeUnknownEffect(VegetableStreamEvent)(parsed)
      expect(decoded.event).toBe(event.event)

      response.cancel()
    }).pipe(Effect.provide(TestLayers)),
  )

  it.effect("should preserve protocol headers through the proxy", () =>
    Effect.gen(function* () {
      const baseUrl = yield* getBaseUrl
      const streamName = `test-headers-${v7()}`
      const event = generateTestEvent()

      yield* createStream(baseUrl, streamName)

      yield* appendEvent(baseUrl, streamName, event)

      const response = yield* executeRequest(
        HttpClientRequest.get(`${baseUrl}/stream/${streamName}?offset=-1`),
      )

      expect(response.status).toBe(200)
      expect(Headers.has(response.headers, "stream-next-offset")).toBe(true)
      expect(Headers.has(response.headers, "stream-up-to-date")).toBe(true)
    }).pipe(Effect.provide(TestLayers)),
  )
})
