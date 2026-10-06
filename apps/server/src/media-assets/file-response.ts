import { MediaAssetStorageError } from "@gororobas/domain"
import { Effect, FileSystem } from "effect"
import { HttpServerRequest, HttpServerResponse } from "effect/http"

/** File responses stream from disk; byte ranges allow players to seek without downloading the entire file. */
export const mediaFileResponse = ({
  filename,
  contentType,
}: {
  filename: string
  contentType?: string | undefined
}) =>
  Effect.gen(function* () {
    const filesystem = yield* FileSystem.FileSystem
    const request = yield* HttpServerRequest.HttpServerRequest
    const info = yield* filesystem.stat(filename)
    const size = Number(info.size)

    const response = yield* HttpServerResponse.file(filename, {
      ...(contentType ? { contentType } : {}),
      ...(filename.endsWith(".m3u8") ? { contentType: "application/vnd.apple.mpegurl" } : {}),
      headers: {
        "accept-ranges": "bytes",
        "cache-control": "private, no-cache",
        "x-content-type-options": "nosniff",
      },
    })

    const range = request.headers.range
    const ifRange = request.headers["if-range"]

    if (
      !range ||
      (ifRange &&
        (ifRange.startsWith("W/") ||
          (ifRange !== response.headers.etag && ifRange !== response.headers["last-modified"])))
    ) {
      return response
    }

    const match = /^bytes=(\d*)-(\d*)$/.exec(range)

    // Unsupported range units and multiple ranges can be ignored with a full response.
    if (!match) return response

    const start = match[1] ? Number(match[1]) : Math.max(0, size - Number(match[2]))
    const end = match[1] && match[2] ? Math.min(size - 1, Number(match[2])) : size - 1

    if (
      (!match[1] && !match[2]) ||
      !Number.isSafeInteger(start) ||
      !Number.isSafeInteger(end) ||
      start > end ||
      start >= size
    ) {
      return HttpServerResponse.empty({
        status: 416,
        headers: { "content-range": `bytes */${size}` },
      })
    }

    return yield* HttpServerResponse.file(filename, {
      status: 206,
      offset: start,
      bytesToRead: end - start + 1,
      headers: { ...response.headers, "content-range": `bytes ${start}-${end}/${size}` },
    })
  }).pipe(
    Effect.catchTag("PlatformError", (cause) =>
      cause.reason._tag === "NotFound"
        ? Effect.succeed(HttpServerResponse.empty({ status: 404 }))
        : Effect.fail(new MediaAssetStorageError({ cause })),
    ),
  )
