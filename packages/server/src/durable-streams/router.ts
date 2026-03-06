import { HttpRouter, HttpServerRequest, HttpServerResponse } from "@effect/platform"
import type { HttpApp } from "@effect/platform"
import { Effect, ServiceMap, Stream } from "effect"

import { DurableStreamsService } from "./service.js"

export const makeDurableStreamRouter: Effect.Effect<
  HttpRouter.HttpRouter<never, never>,
  never,
  DurableStreamsService
> = Effect.gen(function* () {
  const services = yield* Effect.services<DurableStreamsService>()
  const { internalUrl } = ServiceMap.get(services, DurableStreamsService)

  const proxyApp: HttpApp.Default = Effect.gen(function* () {
    const request = yield* HttpServerRequest.HttpServerRequest

    const targetUrl = `${internalUrl}${request.url}`

    const hasBody = request.method !== "GET" && request.method !== "HEAD"
    let body: ReadableStream<Uint8Array> | null = null
    if (hasBody) {
      body = Stream.toReadableStream(request.stream)
    }

    const proxyRequest = new Request(targetUrl, {
      method: request.method,
      headers: new Headers(request.headers as HeadersInit),
      body,
      // @ts-expect-error -- duplex not yet in all TS lib typings
      duplex: hasBody ? "half" : undefined,
    })

    const upstreamResponse = yield* Effect.tryPromise({
      try: () => fetch(proxyRequest),
      catch: (error) => {
        const errorObj = error instanceof Error ? error : new Error(String(error))
        const rootCause =
          "cause" in errorObj && errorObj.cause instanceof Error ? errorObj.cause.message : ""
        return new Error(
          `Proxy to durable stream server failed: ${errorObj.message}${rootCause ? ` (${rootCause})` : ""}`,
        )
      },
    })

    return HttpServerResponse.fromWeb(upstreamResponse)
  }).pipe(
    Effect.catchAll((error) =>
      Effect.succeed(
        HttpServerResponse.text(error instanceof Error ? error.message : String(error), {
          status: 502,
        }),
      ),
    ),
  )

  return HttpRouter.empty.pipe(HttpRouter.mountApp("/stream", proxyApp))
})
