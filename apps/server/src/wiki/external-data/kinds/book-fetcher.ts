import {
  type WikiArticleEditableData,
  type WikiArticleMaterializedRow,
  ExternalDataFetchError,
  BookResult,
  BookExternalDataInputs,
  BookExternalDataResult,
} from "@gororobas/domain"
import { Effect, Option, Result } from "effect"
import { Activity } from "effect/workflow"

import { GoogleBooks } from "../services/google-books.js"

export const normalizeBookLanguage = (language: string): string => {
  const code = language.toLowerCase()
  return Result.getOrElse(
    Result.try(() => new Intl.Locale(code).language),
    () => code,
  )
}

export const fetchGoogleBooksVolume = Effect.fn(function* (volumeId: string) {
  const books = yield* GoogleBooks
  const fetched = yield* books.volume(volumeId)
  const information = fetched.value.volumeInfo

  return BookResult.make({
    observations: [fetched.observation],
    editions: [
      {
        externalId: fetched.value.id,
        title: information.title,
        publisher: information.publisher ?? null,
        publicationDate: information.publishedDate ?? null,
        pageCount: information.pageCount ?? null,
        languages: information.language ? [normalizeBookLanguage(information.language)] : [],
        isbn: (information.industryIdentifiers ?? [])
          .filter((identifier) => identifier.type === "ISBN_10" || identifier.type === "ISBN_13")
          .map((identifier) => identifier.identifier),
        sourceUrl: `https://books.google.com/books?id=${fetched.value.id}`,
      },
    ],
    coverage: "COMPLETE",
  })
})

export const fetchBook = Effect.fn(function* (inputs: typeof BookExternalDataInputs.Type) {
  const googleBooks = Option.isNone(inputs.googleBooksVolumeId)
    ? null
    : yield* Activity.make({
        name: "google-books",
        success: BookResult,
        error: ExternalDataFetchError,
        execute: fetchGoogleBooksVolume(inputs.googleBooksVolumeId.value),
      }).pipe(Effect.result)

  return BookExternalDataResult.make({ kind: "BOOK", attributes: { googleBooks } })
})

export const bookToExternalDataInputs = (
  article: Extract<WikiArticleEditableData | WikiArticleMaterializedRow, { kind: "BOOK" }>,
): typeof BookExternalDataInputs.Type => ({
  kind: "BOOK",
  googleBooksVolumeId: article.attributes.googleBooksVolumeId,
})
