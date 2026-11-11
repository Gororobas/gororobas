import {
  TMDB_BASE_LANGUAGE,
  Tmdb as TmdbReaders,
  TmdbMovie,
  TmdbSearchResponse,
  TmdbSeries,
  type TmdbWork,
  type TmdbWorkId,
} from "@gororobas/domain/claim-based-architecture-experiment/providers/tmdb"
import { Context, Config, Effect, Layer, Option, Redacted } from "effect"

import { makeProviderHttp } from "../../../common/generic-http-service.js"

const MOVIE_APPENDED = ["credits", "external_ids", "translations"].join(",")
const SERIES_APPENDED = ["aggregate_credits", "external_ids", "translations"].join(",")

export const makeTmdb = Effect.gen(function* () {
  const token = yield* Config.Redacted("TMDB_READ_TOKEN").pipe(Config.option)

  // Without a token TMDB answers 401, which fails the fetch for good instead of retrying.
  const http = yield* makeProviderHttp({
    provider: "TMDB",
    baseUrl: "https://api.themoviedb.org",
    headers: Option.match(token, {
      onNone: () => ({}),
      onSome: (value) => ({ Authorization: `Bearer ${Redacted.value(value)}` }),
    }),
  })

  /** A work with its credits, external IDs and every translation, in one request. */
  const work = Effect.fn("Tmdb.work")(function* ({ mediaType, id }: TmdbWorkId) {
    const path = `/3/${mediaType}/${id}`

    if (mediaType === "movie") {
      const fetched = yield* http.get(
        `${path}?language=${TMDB_BASE_LANGUAGE}&append_to_response=${MOVIE_APPENDED}`,
        TmdbMovie,
      )
      const value: TmdbWork = { mediaType, details: fetched.value }
      return { value, observation: { ...fetched.observation, externalId: `${mediaType}/${id}` } }
    }

    const fetched = yield* http.get(
      `${path}?language=${TMDB_BASE_LANGUAGE}&append_to_response=${SERIES_APPENDED}`,
      TmdbSeries,
    )
    const value: TmdbWork = { mediaType, details: fetched.value }
    return { value, observation: { ...fetched.observation, externalId: `${mediaType}/${id}` } }
  })

  /** Movies and series matching a title, most relevant first, for people to match an article to. */
  const search = Effect.fn("Tmdb.search")(function* (query: string) {
    const fetched = yield* http.get(
      `/3/search/multi?query=${encodeURIComponent(query.trim())}&language=${TMDB_BASE_LANGUAGE}&include_adult=false`,
      TmdbSearchResponse,
    )
    return TmdbReaders.suggestions(fetched.value)
  })

  return { work, search }
})

export class Tmdb extends Context.Service<Tmdb, Effect.Success<typeof makeTmdb>>()(
  "external-data/Tmdb",
) {}
export const TmdbLive = Layer.effect(Tmdb)(makeTmdb)
