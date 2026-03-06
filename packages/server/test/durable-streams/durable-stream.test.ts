import { stream } from "@durable-streams/client"
import { HttpRouter, HttpServer } from "@effect/platform"
import { layerTest as NodeHttpServerLayerTest } from "@effect/platform-node/NodeHttpServer"
import { describe, it, expect } from "@effect/vitest"
import { Arbitrary, Effect, FastCheck, Layer, Schema } from "effect"

import { makeDurableStreamRouter } from "../../src/durable-streams/router.js"
import {
  VegetableStreamEvent,
  VegetableStreamEventBinary,
} from "../../src/durable-streams/schemas.js"
import {
  DurableStreamsConfig,
  DurableStreamsServiceLive,
} from "../../src/durable-streams/service.js"

const VegetableStreamEventArbitrary = Arbitrary.make(VegetableStreamEvent)

const generateTestEvent = () => {
  return FastCheck.sample(VegetableStreamEventArbitrary, 1)[0]
}

const config: DurableStreamsConfig = {
  dataDir: "./test/durable-streams/data",
}

const ServiceLayer = DurableStreamsServiceLive(config)

const ServerLayer = Layer.provide(
  Layer.unwrapScoped(
    Effect.gen(function* () {
      const router = yield* makeDurableStreamRouter
      const httpApp = yield* HttpRouter.toHttpApp(router)
      return HttpServer.serve(httpApp)
    }),
  ),
  ServiceLayer,
)

const TestLayers = Layer.provideMerge(ServerLayer, NodeHttpServerLayerTest)

const getBaseUrl = Effect.gen(function* () {
  const server = yield* HttpServer.HttpServer
  const address = server.address
  return address._tag === "TcpAddress" ? `http://localhost:${address.port}` : ""
})

const collectBodyAndParseJson = (response: Awaited<ReturnType<typeof stream>>) =>
  Effect.gen(function* () {
    const body = yield* Effect.tryPromise(() => response.body())
    const text = new TextDecoder().decode(body)
    if (!text.trim()) return []

    const messages: unknown[] = []
    let pos = 0

    while (pos < text.length) {
      if (text[pos] === "{") {
        let depth = 0
        let stringMode = false
        let escapeMode = false
        const start = pos

        while (pos < text.length) {
          const char = text[pos]

          if (escapeMode) {
            escapeMode = false
          } else if (char === "\\") {
            escapeMode = true
          } else if (stringMode) {
            if (char === '"') stringMode = false
          } else if (char === '"') {
            stringMode = true
          } else if (char === "{" || char === "[") {
            depth++
          } else if (char === "}" || char === "]") {
            depth--
            if (depth === 0) {
              const jsonStr = text.slice(start, pos + 1)
              messages.push(JSON.parse(jsonStr))
              break
            }
          }
          pos++
        }
      }
      pos++
    }

    return messages
  })

const appendEvent = (baseUrl: string, streamName: string, event: VegetableStreamEvent) =>
  Effect.gen(function* () {
    const encoded = yield* Schema.encode(VegetableStreamEventBinary)(event)
    const response = yield* Effect.tryPromise({
      try: () =>
        fetch(`${baseUrl}/stream/${streamName}`, {
          method: "POST",
          headers: { "content-type": "application/octet-stream" },
          body: new Uint8Array(encoded),
        }),
      catch: (error) => new Error(String(error)),
    })
    return response
  })

const createStream = (baseUrl: string, streamName: string) =>
  Effect.tryPromise({
    try: () =>
      fetch(`${baseUrl}/stream/${streamName}`, {
        method: "PUT",
      }),
    catch: (error) => new Error(String(error)),
  })

describe("DurableStream proxy integration", () => {
  it.effect("should create a stream via PUT and read empty", () =>
    Effect.gen(function* () {
      const baseUrl = yield* getBaseUrl
      const streamName = `test-create-${Date.now()}`

      const createResponse = yield* createStream(baseUrl, streamName)
      expect(createResponse.status).toBe(201)

      const response = yield* Effect.tryPromise({
        try: () => fetch(`${baseUrl}/stream/${streamName}?offset=-1`),
        catch: (error) => new Error(String(error)),
      })
      expect(response.status).toBe(200)
      expect(response.headers.has("stream-next-offset")).toBe(true)
    }).pipe(Effect.provide(TestLayers)),
  )

  it.effect("should append and read back via durable streams protocol", () =>
    Effect.gen(function* () {
      const baseUrl = yield* getBaseUrl
      const streamName = `test-append-${Date.now()}`
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
        catch: (error) => new Error(String(error)),
      })

      const jsonMessages = yield* collectBodyAndParseJson(response)
      expect(jsonMessages).toHaveLength(1)

      const decoded = yield* Schema.decodeUnknown(VegetableStreamEvent)(jsonMessages[0])
      expect(decoded.event).toBe(event.event)
      expect(decoded.vegetable_id).toBe(event.vegetable_id)
    }).pipe(Effect.provide(TestLayers)),
  )

  it.effect("should support reading from a specific offset", () =>
    Effect.gen(function* () {
      const baseUrl = yield* getBaseUrl
      const streamName = `test-offset-${Date.now()}`
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
        catch: (error) => new Error(String(error)),
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
        catch: (error) => new Error(String(error)),
      })
      const secondMessages = yield* collectBodyAndParseJson(secondRead)
      expect(secondMessages).toHaveLength(1)

      const decoded = yield* Schema.decodeUnknown(VegetableStreamEvent)(secondMessages[0])
      expect(decoded.event).toBe(event2.event)
    }).pipe(Effect.provide(TestLayers)),
  )

  it.effect("should handle multiple events in sequence", () =>
    Effect.gen(function* () {
      const baseUrl = yield* getBaseUrl
      const streamName = `test-multi-${Date.now()}`
      const events = [generateTestEvent(), generateTestEvent(), generateTestEvent()]

      yield* createStream(baseUrl, streamName)

      for (const event of events) {
        yield* appendEvent(baseUrl, streamName, event)
      }

      const response = yield* Effect.tryPromise({
        try: () =>
          stream({
            url: `${baseUrl}/stream/${streamName}`,
            offset: "-1",
            live: false,
          }),
        catch: (error) => new Error(String(error)),
      })

      const jsonMessages = yield* collectBodyAndParseJson(response)
      expect(jsonMessages).toHaveLength(3)

      for (let i = 0; i < events.length; i++) {
        const decoded = yield* Schema.decodeUnknown(VegetableStreamEvent)(jsonMessages[i])
        expect(decoded.event).toBe(events[i].event)
        expect(decoded.vegetable_id).toBe(events[i].vegetable_id)
      }
    }).pipe(Effect.provide(TestLayers)),
  )

  it.effect("should support SSE live mode via the proxy", () =>
    Effect.gen(function* () {
      const baseUrl = yield* getBaseUrl
      const streamName = `test-sse-${Date.now()}`
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
        catch: (error) => new Error(String(error)),
      })

      const text = yield* Effect.tryPromise({
        try: () => response.text(),
        catch: (error) => new Error(String(error)),
      })

      expect(text.trim()).toBeTruthy()
      const parsed = JSON.parse(text)
      const decoded = yield* Schema.decodeUnknown(VegetableStreamEvent)(parsed)
      expect(decoded.event).toBe(event.event)

      response.cancel()
    }).pipe(Effect.provide(TestLayers)),
  )

  it.effect("should preserve protocol headers through the proxy", () =>
    Effect.gen(function* () {
      const baseUrl = yield* getBaseUrl
      const streamName = `test-headers-${Date.now()}`
      const event = generateTestEvent()

      yield* createStream(baseUrl, streamName)

      yield* appendEvent(baseUrl, streamName, event)

      const response = yield* Effect.tryPromise({
        try: () => fetch(`${baseUrl}/stream/${streamName}?offset=-1`),
        catch: (error) => new Error(String(error)),
      })

      expect(response.status).toBe(200)
      expect(response.headers.has("stream-next-offset")).toBe(true)
      expect(response.headers.has("stream-up-to-date")).toBe(true)
    }).pipe(Effect.provide(TestLayers)),
  )
})
