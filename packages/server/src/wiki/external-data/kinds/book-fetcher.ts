import {
  ExternalDataFetchError,
  BookResult,
  BookExternalDataInputs,
  BookExternalDataResult,
} from "@gororobas/domain"
import { Array as EffectArray, Effect, Option, Result, Stream } from "effect"
import { Activity } from "effect/unstable/workflow"

import { GoogleBooks } from "../services/google-books.js"
import { OpenLibrary } from "../services/open-library.js"

export const normalizeOpenLibraryLanguage = (language: string): string => {
  const code = language.replace("/languages/", "").toLowerCase()
  return Result.getOrElse(
    Result.try(() => new Intl.Locale(code).language),
    () => code,
  )
}

export const fetchOpenLibraryBook = Effect.fn(function* (workId: string) {
  const library = yield* OpenLibrary

  // Bound interactive external data to five pages; coverage records truncated enumeration.
  const pages = yield* Stream.paginate(0, (page) =>
    library
      .editionsPage(workId, page)
      .pipe(
        Effect.map(
          (fetched) =>
            [
              [fetched],
              fetched.value.links.next && page < 4 ? Option.some(page + 1) : Option.none(),
            ] as const,
        ),
      ),
  ).pipe(Stream.runCollect)
  const lastPage = pages[pages.length - 1]
  const isComplete = !lastPage?.value.links.next

  return BookResult.make({
    observations: pages.map((page) => page.observation),
    editions: pages.flatMap((page) =>
      page.value.entries.map((edition) => ({
        externalId: edition.key,
        title: edition.title,
        publisher: edition.publishers?.join("; ") ?? null,
        publicationDate: edition.publishDate ?? null,
        pageCount: edition.numberOfPages ?? null,
        languages: EffectArray.dedupe(
          (edition.languages ?? []).map((language) => normalizeOpenLibraryLanguage(language.key)),
        ),
        isbn: EffectArray.dedupe([...(edition.isbn10 ?? []), ...(edition.isbn13 ?? [])]),
        sourceUrl: `https://openlibrary.org${edition.key}`,
      })),
    ),
    coverage: isComplete ? "COMPLETE" : "PARTIAL",
  })
})

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
        languages: information.language ? [normalizeOpenLibraryLanguage(information.language)] : [],
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
  const openLibrary = Option.isNone(inputs.openLibraryWorkId)
    ? null
    : yield* Activity.make({
        name: "open-library",
        success: BookResult,
        error: ExternalDataFetchError,
        execute: fetchOpenLibraryBook(inputs.openLibraryWorkId.value),
      }).pipe(Effect.result)

  const googleBooks = Option.isNone(inputs.googleBooksVolumeId)
    ? null
    : yield* Activity.make({
        name: "google-books",
        success: BookResult,
        error: ExternalDataFetchError,
        execute: fetchGoogleBooksVolume(inputs.googleBooksVolumeId.value),
      }).pipe(Effect.result)

  return BookExternalDataResult.make({ kind: "BOOK", attributes: { openLibrary, googleBooks } })
})
