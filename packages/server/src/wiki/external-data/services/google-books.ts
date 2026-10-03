import { ExternalDataFetchError, GoogleBooksVolumeId } from "@gororobas/domain"
import { Config, Context, Effect, Layer, Option, Redacted } from "effect"

import { makeProviderHttp } from "../../../common/generic-http-service.js"
import { GoogleBooksVolume } from "./google-books.schema.js"

export const makeGoogleBooks = Effect.gen(function* () {
  const http = yield* makeProviderHttp("GOOGLE_BOOKS", "https://www.googleapis.com")
  const apiKey = yield* Config.Redacted("GOOGLE_BOOKS_API_KEY").pipe(Config.option)

  return {
    volume: Effect.fn(function* (id: GoogleBooksVolumeId) {
      const key = Option.match(apiKey, {
        onNone: () => "",
        onSome: (value) => `?key=${encodeURIComponent(Redacted.value(value))}`,
      })
      const fetched = yield* http.get(
        `/books/v1/volumes/${encodeURIComponent(id)}${key}`,
        GoogleBooksVolume,
      )

      if (fetched.value.id !== id) {
        return yield* new ExternalDataFetchError({
          provider: "GOOGLE_BOOKS",
          message: "Volume identity mismatch",
          retryable: false,
        })
      }

      return {
        ...fetched,
        observation: {
          ...fetched.observation,
          externalId: id,
          sourceUrl: `https://www.googleapis.com/books/v1/volumes/${id}`,
        },
      }
    }),
  }
})

export class GoogleBooks extends Context.Service<
  GoogleBooks,
  Effect.Success<typeof makeGoogleBooks>
>()("external-data/GoogleBooks") {}

export const GoogleBooksLive = Layer.effect(GoogleBooks)(makeGoogleBooks)
