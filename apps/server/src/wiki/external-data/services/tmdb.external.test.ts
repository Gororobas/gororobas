/**
 * Calls TMDB for real, to catch its responses drifting from our schemas. Needs `TMDB_READ_TOKEN`.
 * Run with `pnpm --filter @gororobas/server test:external`.
 */
import { describe, expect, it } from "@effect/vitest"
import { TmdbId } from "@gororobas/domain"
import type { TmdbWorkId } from "@gororobas/domain/claim-based-architecture-experiment/providers/tmdb"
import { Effect, Layer } from "effect"
import { FetchHttpClient } from "effect/http"

import { Tmdb, TmdbLive } from "./tmdb.js"

const theMatrix: TmdbWorkId = { mediaType: "movie", id: TmdbId.make("603") }
const breakingBad: TmdbWorkId = { mediaType: "tv", id: TmdbId.make("1396") }

const layer = TmdbLive.pipe(Layer.provide(FetchHttpClient.layer))

describe("Tmdb", () => {
  it.live("fetches a movie with its credits, external IDs and translations", () =>
    Effect.gen(function* () {
      const tmdb = yield* Tmdb
      const { value, observation } = yield* tmdb.work(theMatrix)

      expect(value.mediaType).toBe("movie")
      expect(value.details.externalIds.imdbId).toBe("tt0133093")
      expect(value.details.translations.translations.length).toBeGreaterThan(1)
      expect(observation.externalId).toBe("movie/603")
    }).pipe(Effect.provide(layer)),
  )

  it.live("fetches a series", () =>
    Effect.gen(function* () {
      const tmdb = yield* Tmdb
      const { value } = yield* tmdb.work(breakingBad)

      expect(value.mediaType).toBe("tv")
      expect(value.details.externalIds.wikidataId).toBe("Q1079")
    }).pipe(Effect.provide(layer)),
  )

  it.live("searches movies and series, leaving out people", () =>
    Effect.gen(function* () {
      const tmdb = yield* Tmdb
      const suggestions = yield* tmdb.search("breaking bad")

      expect(suggestions.map(({ work }) => work)).toContainEqual(breakingBad)
    }).pipe(Effect.provide(layer)),
  )

  it.live("fails for good on a work that doesn't exist", () =>
    Effect.gen(function* () {
      const tmdb = yield* Tmdb
      const error = yield* Effect.flip(
        tmdb.work({ mediaType: "movie", id: TmdbId.make("999999999") }),
      )

      expect(error.retryable).toBe(false)
    }).pipe(Effect.provide(layer)),
  )
})
