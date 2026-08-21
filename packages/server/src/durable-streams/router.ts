import { Effect, Stream } from "effect"
import { HttpRouter, HttpServerRequest, HttpServerResponse } from "effect/unstable/http"

import { DurableStreamServerError, DurableStreamsService } from "./service.js"

export const makeDurableStreamRouter = HttpRouter.use((router) =>
  Effect.gen(function* () {
    const { internalUrl } = yield* DurableStreamsService

    const prefixedRouter = router.prefixed("/stream")

    const proxyHandler = Effect.gen(function* () {
      const request = yield* HttpServerRequest.HttpServerRequest

      const targetUrl = `${internalUrl}${request.url}`

      const hasBody = request.method !== "GET" && request.method !== "HEAD"
      // A missing body is meaningful to Request, so keep this Web API shape here.
      // oxlint-disable-next-line effect/prefer-option-over-null
      let body: ReadableStream<Uint8Array> | undefined
      if (hasBody) {
        body = Stream.toReadableStream(request.stream)
      }

      const proxyRequest = new Request(targetUrl, {
        method: request.method,
        headers: new Headers(request.headers),
        body,
        // @ts-expect-error -- duplex not yet in all TS lib typings
        duplex: hasBody ? "half" : undefined,
      })

      const upstreamResponse = yield* Effect.tryPromise({
        // The proxy must forward the request through the Web Fetch API.
        // oxlint-disable-next-line effect/avoid-native-fetch
        try: () => fetch(proxyRequest),
        catch: (error) => {
          return new DurableStreamServerError({
            message: `Proxy to durable stream server failed: ${String(error)}`,
          })
        },
      })

      return HttpServerResponse.fromWeb(upstreamResponse)
    }).pipe(
      Effect.catchTag("DurableStreamServerError", (error) =>
        Effect.succeed(
          HttpServerResponse.text(error.message, {
            status: 502,
          }),
        ),
      ),
    )

    yield* prefixedRouter.add("*", "*", proxyHandler)
  }),
)
