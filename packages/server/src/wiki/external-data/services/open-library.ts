import { OpenLibraryWorkId } from "@gororobas/domain"
import { Context, Effect, Layer } from "effect"

import { makeProviderHttp } from "../../../common/generic-http-service.js"
import { OpenLibraryEditionsPage } from "./open-library.schema.js"

export const makeOpenLibrary = Effect.gen(function* () {
  const http = yield* makeProviderHttp("OPEN_LIBRARY", "https://openlibrary.org")

  return {
    editionsPage: Effect.fn(function* (id: OpenLibraryWorkId, page: number) {
      return yield* http.get(
        `/works/${id}/editions.json?limit=100&offset=${page * 100}`,
        OpenLibraryEditionsPage,
      )
    }),
  }
})

export class OpenLibrary extends Context.Service<
  OpenLibrary,
  Effect.Success<typeof makeOpenLibrary>
>()("external-data/OpenLibrary") {}

export const OpenLibraryLive = Layer.effect(OpenLibrary)(makeOpenLibrary)
