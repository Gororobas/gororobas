import {
  type WikiArticleEditableData,
  type WikiArticleProjectionRow,
  ExternalDataFetchError,
  BookResult,
  BookExternalDataInputs,
  BookExternalDataResult,
  type GoogleBooksVolumeId,
  isbnDigits,
  isValidIsbn,
} from "@gororobas/domain"
import { Array as EffectArray, Effect, Option, Result } from "effect"
import { Activity } from "effect/workflow"

import { GoogleBooks } from "../services/google-books.js"

export const normalizeBookLanguage = (language: string): string => {
  const code = language.toLowerCase()
  return Result.getOrElse(
    Result.try(() => new Intl.Locale(code).language),
    () => code,
  )
}

export const fetchGoogleBooksVolume = Effect.fn(function* (volumeId: GoogleBooksVolumeId) {
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

/** The article's valid ISBNs, ISBN-13 first, as Google Books writes them. */
export const searchableIsbns = (inputs: typeof BookExternalDataInputs.Type) =>
  EffectArray.dedupe(
    EffectArray.getSomes([inputs.isbn13, inputs.isbn10]).filter(isValidIsbn).map(isbnDigits),
  )

/**
 * Google Books' `isbn:` search also returns volumes that don't list the ISBN, so only a volume
 * whose industry identifiers include it counts.
 */
const findVolumeIdListingIsbn = Effect.fn(function* (isbns: ReadonlyArray<string>) {
  const books = yield* GoogleBooks

  return yield* Effect.findFirstFilter(isbns, (isbn) =>
    Effect.map(books.searchVolumes(`isbn:${isbn}`), (volumes) => {
      const listing = volumes.find((volume) =>
        (volume.volumeInfo.industryIdentifiers ?? []).some(
          (identifier) => isbnDigits(identifier.identifier) === isbn,
        ),
      )

      return listing === undefined ? Result.failVoid : Result.succeed(listing.id)
    }),
  )
})

/** An ISBN no volume lists is a successful empty result, so it isn't retried every hour. */
export const fetchGoogleBooksVolumeByIsbn = Effect.fn(function* (isbns: ReadonlyArray<string>) {
  const volumeId = yield* findVolumeIdListingIsbn(isbns)

  return Option.isSome(volumeId)
    ? yield* fetchGoogleBooksVolume(volumeId.value)
    : BookResult.make({ observations: [], editions: [], coverage: "COMPLETE" })
})

export const fetchBook = Effect.fn(function* (inputs: typeof BookExternalDataInputs.Type) {
  const isbns = searchableIsbns(inputs)

  const execute = Option.match(inputs.googleBooksVolumeId, {
    onSome: (volumeId) => Option.some(fetchGoogleBooksVolume(volumeId)),
    onNone: () =>
      EffectArray.isReadonlyArrayNonEmpty(isbns)
        ? Option.some(fetchGoogleBooksVolumeByIsbn(isbns))
        : Option.none(),
  })

  const googleBooks = Option.isNone(execute)
    ? null
    : yield* Activity.make({
        name: "google-books",
        success: BookResult,
        error: ExternalDataFetchError,
        execute: execute.value,
      }).pipe(Effect.result)

  return BookExternalDataResult.make({ kind: "BOOK", attributes: { googleBooks } })
})

export const bookToExternalDataInputs = (
  article: Extract<WikiArticleEditableData | WikiArticleProjectionRow, { kind: "BOOK" }>,
): typeof BookExternalDataInputs.Type => ({
  kind: "BOOK",
  googleBooksVolumeId: article.attributes.googleBooksVolumeId,
  isbn13: article.attributes.isbn13,
  isbn10: article.attributes.isbn10,
})
