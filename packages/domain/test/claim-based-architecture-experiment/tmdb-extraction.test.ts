import { describe, expect, it } from "@effect/vitest"
import { Array as EffectArray, Option, Schema } from "effect"

import { extractArticle } from "../../src/claim-based-architecture-experiment/article-extraction.js"
import type { ExtractionContext } from "../../src/claim-based-architecture-experiment/extraction.js"
import type { PropertyExtraction } from "../../src/claim-based-architecture-experiment/property.js"
import {
  Tmdb,
  TmdbMovie,
  TmdbSearchResponse,
  TmdbSeries,
  type TmdbWork,
} from "../../src/claim-based-architecture-experiment/providers/tmdb.js"
import { tmdbMovie, tmdbSearch, tmdbSeries } from "../fixtures/tmdb-works.js"

// The fixtures are raw TMDB JSON, decoded as a response would be.
/* oxlint-disable custom-lint-rules/no-schema-decode-unknown -- see above. */
const theMatrix: TmdbWork = {
  mediaType: "movie",
  details: Schema.decodeSync(TmdbMovie)(tmdbMovie),
}
const breakingBad: TmdbWork = {
  mediaType: "tv",
  details: Schema.decodeSync(TmdbSeries)(tmdbSeries),
}
const search = Schema.decodeUnknownSync(TmdbSearchResponse)(tmdbSearch)

/* oxlint-enable custom-lint-rules/no-schema-decode-unknown */

const context: ExtractionContext = {
  articleWithWikidataId: () => Option.none(),
  articleWithWhosOnFirstId: () => Option.none(),
  labelOf: () => Option.none(),
  languageTagOf: () => Option.none(),
  importedFile: () => Option.none(),
}

const extraction = (work: TmdbWork) =>
  extractArticle({ input: { provider: "TMDB", result: work }, kind: "FILM", context })

const valuesOf = (work: TmdbWork, propertyId: string) =>
  Option.match(
    EffectArray.findFirst(
      extraction(work).properties,
      (property: PropertyExtraction<unknown>) => property.propertyId === propertyId,
    ),
    { onNone: () => [], onSome: ({ values }) => values.map(({ value }) => value) },
  )

describe("extraction from TMDB", () => {
  it("reads a movie", () => {
    expect(valuesOf(theMatrix, "tmdbId")).toEqual([])
    expect(valuesOf(theMatrix, "audiovisualFormat")).toEqual(["FILM"])
    expect(valuesOf(theMatrix, "imdbId")).toEqual(["tt0133093"])
    expect(valuesOf(theMatrix, "wikidataId")).toEqual(["Q83495"])
    expect(valuesOf(theMatrix, "runtime")).toEqual([136])
    expect(valuesOf(theMatrix, "numberOfSeasons")).toEqual([])
    expect(valuesOf(theMatrix, "directors")).toEqual([
      { _tag: "NAME", name: "Lana Wachowski" },
      { _tag: "NAME", name: "Lilly Wachowski" },
    ])
    expect(valuesOf(theMatrix, "datePublished")).toEqual([
      { year: 1999, month: 3, day: 31, precision: "day", timezone: "UTC" },
    ])
    expect(valuesOf(theMatrix, "genres")).toEqual([
      { _tag: "NAME", name: "Ação" },
      { _tag: "NAME", name: "Ficção científica" },
    ])
    expect(valuesOf(theMatrix, "countryOfOrigin")).toEqual([
      { _tag: "NAME", name: "Estados Unidos" },
    ])
    expect(valuesOf(theMatrix, "inLanguage")).toEqual(["en"])
  })

  it("reads a series: seasons and episodes instead of runtime and directors", () => {
    expect(valuesOf(breakingBad, "audiovisualFormat")).toEqual(["SERIES"])
    expect(valuesOf(breakingBad, "numberOfSeasons")).toEqual([5])
    expect(valuesOf(breakingBad, "numberOfEpisodes")).toEqual([62])
    expect(valuesOf(breakingBad, "runtime")).toEqual([])
    expect(valuesOf(breakingBad, "directors")).toEqual([])
    expect(valuesOf(breakingBad, "wikidataId")).toEqual(["Q1079"])
    expect(valuesOf(breakingBad, "website")).toEqual([
      "https://www.sonypictures.com/tv/breakingbad",
    ])
    expect(valuesOf(breakingBad, "inLanguage")).toEqual(["en", "de", "es"])
  })

  it("names a work in the language of each translation, Brazilian Portuguese before European", () => {
    const portuguese = Tmdb.titles(theMatrix).filter(({ language }) => language === "pt")
    expect(portuguese.map(({ value }) => value)).toEqual(["Matrix", "Matrix"])
    expect(Tmdb.titles(theMatrix)[0]).toEqual({ language: "en", value: "The Matrix" })
  })

  it("lists the top-billed cast in order, however many TMDB has", () => {
    const cast = Tmdb.cast(theMatrix)
    expect(cast).toHaveLength(10)
    expect(cast.slice(0, 3)).toEqual(["Keanu Reeves", "Laurence Fishburne", "Carrie-Anne Moss"])
  })

  it("reads no issues from real responses", () => {
    expect(extraction(theMatrix).issues).toEqual([])
    expect(extraction(breakingBad).properties.flatMap(({ issues }) => issues)).toEqual([])
    expect(extraction(theMatrix).properties.flatMap(({ issues }) => issues)).toEqual([])
  })

  it("suggests works from a search, linking to TMDB's page", () => {
    const suggestions = Tmdb.suggestions(search)

    expect(suggestions[0]).toMatchObject({
      work: { mediaType: "movie", id: "603" },
      originalTitle: "The Matrix",
      year: 1999,
      sourceUrl: "https://www.themoviedb.org/movie/603",
    })
  })
})
